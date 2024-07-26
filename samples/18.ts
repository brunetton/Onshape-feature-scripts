// https://cad.onshape.com/documents/6dff8f67e2ef0b33193a10d2/w/ad1dd98bb99d14ca27c2eb74/e/fdb1d4a84952e24a2af8e3c2

FeatureScript 1560;
import(path : "onshape/std/common.fs", version : "1560.0");
img::import(path : "87ad57ff25961bfc9686bd3e", version : "97c67f92534cc71c347724e8");
icon::import(path : "48b129c6e2a454acde3a3baf", version : "53bdfee7fd2c348eaa0b8dc3");


export enum wireCountOptions
{
    annotation { "Name" : "1 wire" }
    WIRES1,
    annotation { "Name" : "2 wires" }
    WIRES2,
    annotation { "Name" : "3 wires" }
    WIRES3,
    annotation { "Name" : "4 wires" }
    WIRES4,
    annotation { "Name" : "5 wires" }
    WIRES5,
    annotation { "Name" : "Custom profile" }
    CUSTOM
}

export enum inputType
{
    annotation { "Name" : "Points" }
    POINTS,
    annotation { "Name" : "Curves" }
    CURVES
}

annotation { "Feature Type Name" : "Wiring",
        "Feature Name Template" : "Wiring - #length",
        "Feature Type Description" : "Creates individual wire bundles that go through the selected vertices in 3D space.",
        "Description Image" : img::BLOB_DATA,
        "Icon" : icon::BLOB_DATA }
export const wiring = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Input type", "UIHint" : UIHint.HORIZONTAL_ENUM }
        definition.inputType is inputType;

        if (definition.inputType == inputType.POINTS)
        {
            annotation { "Name" : "Wire points", "Filter" : EntityType.VERTEX || BodyType.MATE_CONNECTOR, "UIHint" : "ALLOW_QUERY_ORDER" }
            definition.wirePoints is Query;

            annotation { "Name" : "Start direction",
                        "Filter" : QueryFilterCompound.ALLOWS_DIRECTION || QueryFilterCompound.ALLOWS_AXIS,
                        "MaxNumberOfPicks" : 1 }
            definition.startDirection is Query;

            annotation { "Name" : "Starting straightness" }
            isLength(definition.startNormal, NONNEGATIVE_LENGTH_BOUNDS);

            annotation { "Name" : "Opposite direction", "UIHint" : "OPPOSITE_DIRECTION" }
            definition.flipStart is boolean;

            annotation { "Name" : "End direction",
                        "Filter" : QueryFilterCompound.ALLOWS_DIRECTION || QueryFilterCompound.ALLOWS_AXIS,
                        "MaxNumberOfPicks" : 1 }
            definition.endDirection is Query;

            annotation { "Name" : "Ending straightness" }
            isLength(definition.endNormal, NONNEGATIVE_LENGTH_BOUNDS);

            annotation { "Name" : "Opposite direction", "UIHint" : "OPPOSITE_DIRECTION" }
            definition.flipEnd is boolean;
        }
        else
        {
            annotation { "Name" : "Wire path", "Filter" : EntityType.EDGE }
            definition.wirePath is Query;
        }

        annotation { "Name" : "Wire count" }
        definition.wireCount is wireCountOptions;

        if (definition.wireCount == wireCountOptions.CUSTOM)
        {
            annotation { "Name" : "Custom profile", "Filter" : (EntityType.FACE && GeometryType.PLANE)
                        && ConstructionObject.NO }
            definition.customProfile is Query;
        }
        else
        {
            annotation { "Name" : "Custom diameter", "Default" : true }
            definition.customGauge is boolean;

            if (definition.customGauge)
            {
                annotation { "Name" : "Wire diameter" }
                isLength(definition.diameter, {
                                (meter) : [1e-5, 3, 500],
                                (centimeter) : 1,
                                (millimeter) : 5,
                                (inch) : 0.125,
                                (foot) : 0.1,
                                (yard) : 0.025
                            } as LengthBoundSpec);
            }
            else
            {
                annotation { "Name" : "Wire gauge (AWG)" }
                isInteger(definition.wireGauge, {
                                (unitless) : [0, 12, 36]
                            } as IntegerBoundSpec);
            }

            annotation { "Name" : "Clocking angle" }
            isAngle(definition.clockingAngle, ANGLE_360_ZERO_DEFAULT_BOUNDS);
        }
    }
    {
        var references = definition.inputType == inputType.POINTS ? definition.wirePoints : definition.wirePath;
        if (definition.wireCount == wireCountOptions.CUSTOM)
        {
            references = qUnion([references, definition.customProfile]);
        }
        var remainingTransform = getRemainderPatternTransform(context, {
                "references" : references
            });

        // calculate the diameter from the gauge
        if (!definition.customGauge)
        {
            definition.diameter = wireDiameter(definition.wireGauge);
        }

        // keep track of bodies we should delete at the end
        var bodiesToDelete = [];
        var desiredEdge;
        var firstPoint;
        var result;

        if (definition.inputType == inputType.POINTS)
        {
            var evaluatedPoints = evaluateQuery(context, definition.wirePoints);
            result = findSweepPath(context, id, definition, evaluatedPoints, bodiesToDelete);
            desiredEdge = result.desiredEdge;
            bodiesToDelete = result.bodiesToDelete;
            firstPoint = result.firstPoint;
        }
        else
        {
            desiredEdge = definition.wirePath;
            firstPoint = evEdgeTangentLine(context, {
                            "edge" : definition.wirePath,
                            "parameter" : 0
                        }).origin;
        }

        // update the feature's length
        setFeatureComputedParameter(context, id, {
                    "name" : "length",
                    "value" : evLength(context, {
                            "entities" : desiredEdge
                        })
                });

        var profiles = [];

        if (definition.wireCount == wireCountOptions.CUSTOM)
        {
            profiles = [definition.customProfile];
            if (size(evaluateQuery(context, definition.customProfile)) == 0)
            {
                throw regenError("Select custom profile", ["customProfile"]);
            }
        }
        else
        {
            var location;
            var sketchPlane;

            // Setup for sketching wire bundle profile
            if (definition.inputType == inputType.POINTS)
            {
                location = evVertexPoint(context, {
                            "vertex" : qNthElement(definition.wirePoints, 0)
                        });
                sketchPlane = plane(location, result.firstNormal);
            }
            else
            {
                var startLocation = evEdgeTangentLine(context, {
                        "edge" : definition.wirePath,
                        "parameter" : 0
                    });
                location = startLocation.origin;
                sketchPlane = plane(location, startLocation.direction);
            }
            // Build the profile
            var sketch = newSketchOnPlane(context, id + "sketch1", { "sketchPlane" : sketchPlane });
            var point = worldToPlane(sketchPlane, location);
            var circleCenters = [];
            const radius = definition.diameter / 2;

            // create n circles
            if (definition.wireCount == wireCountOptions.WIRES1)
            {
                var center = vector(point[0], point[1]);
                circleCenters = append(circleCenters, center);
                skCircle(sketch, "circle" ~ 1, {
                            "center" : center,
                            "radius" : radius
                        });
            }
            else
            {
                var numberOfWires = switch(definition.wireCount) {
                    wireCountOptions.WIRES2 : 2,
                    wireCountOptions.WIRES3 : 3,
                    wireCountOptions.WIRES4 : 4,
                    wireCountOptions.WIRES5 : 5,
                };

                for (var i = 0; i < numberOfWires; i += 1)
                {
                    // Math to determine where to position sketch of wire circles
                    var theta0 = PI / numberOfWires;

                    var theta = (2 * theta0 * i) + (3 * theta0 - PI / 2);
                    var r = radius / sin(theta0 * radian);

                    // Change from polar coordinates to cartesian
                    var x = point[0] + r * cos(theta * radian);
                    var y = point[1] + r * sin(theta * radian);

                    var center = vector(x, y);

                    circleCenters = append(circleCenters, center);
                    skCircle(sketch, "circle" ~ i, {
                                "center" : center,
                                "radius" : radius
                            });
                }
            }

            skSolve(sketch);
            bodiesToDelete = append(bodiesToDelete, qCreatedBy(id + "sketch1", EntityType.BODY));

            // rotate the sketch by the clocking angle
            var rotationAxis = line(firstPoint, sketchPlane.normal);
            var t = rotationAround(rotationAxis, definition.clockingAngle);
            opTransform(context, id + "transform1", {
                        "bodies" : qCreatedBy(id + "sketch1", EntityType.BODY),
                        "transform" : t
                    });

            // find the faces to sweep
            var sketchFaces = qCreatedBy(id + "sketch1", EntityType.FACE);

            for (var circleCenter in circleCenters)
            {
                profiles = append(profiles, qContainsPoint(sketchFaces, t * planeToWorld(sketchPlane, circleCenter)));
            }
        }

        try
        {
            // sweep the wires
            opSweep(context, id, {
                        "profiles" : qUnion(profiles),
                        "path" : desiredEdge });
        }
        catch (error)
        {
            setErrorEntities(context, id, {
                        "entities" : desiredEdge
                    });
            throw error;
        }

        // cleanup by deleting reference geometry
        opDeleteBodies(context, id + "deleteBodies1", {
                    "entities" : qUnion(bodiesToDelete)
                });

        transformResultIfNecessary(context, id, remainingTransform);
    });

function findSweepPath(context is Context, id is Id, definition is map, evaluatedPoints, bodiesToDelete)
{
    var numPoints = size(evaluatedPoints);
    if (numPoints < 2)
    {
        throw regenError("Select wire points", ["wirePoints"]);
    }

    var points is array = mapArray(evaluatedPoints, function(q is Query)
    {
        return evVertexPoint(context, {
                    "vertex" : q
                });
    });

    var firstNormal = extractDirection(context, definition.startDirection);
    if (firstNormal == undefined)
    {
        var startSketchPlane;
        try
        {
            startSketchPlane = evOwnerSketchPlane(context, {
                        "entity" : evaluatedPoints[0]
                    });
        }
        catch (error)
        {
            throw regenError("Select a start direction", ["startDirection"]);
        }

        // Determine if we have to flip the direction of the sketch planes
        if (dot((points[1] - points[0]), startSketchPlane.normal) < 0)
        {
            firstNormal = -startSketchPlane.normal;
        }
        else
        {
            firstNormal = startSketchPlane.normal;
        }
    }

    var lastNormal = extractDirection(context, definition.endDirection);
    if (lastNormal == undefined)
    {
        var endSketchPlane;
        try
        {
            endSketchPlane = evOwnerSketchPlane(context, {
                        "entity" : evaluatedPoints[numPoints - 1]
                    });
        }
        catch (error)
        {
            throw regenError("Select an end direction", ["endDirection"]);
        }

        if (dot((points[numPoints - 2] - points[numPoints - 1]), endSketchPlane.normal) < 0)
        {
            lastNormal = endSketchPlane.normal;
        }
        else
        {
            lastNormal = -endSketchPlane.normal;
        }
    }

    if (definition.flipStart)
    {
        firstNormal *= -1;
    }
    if (definition.flipEnd)
    {
        lastNormal *= -1;
    }

    try
    {
        opFitSpline(context, id + "fitSpline1", {
                    "points" : points,
                    "startDerivative" : firstNormal * definition.startNormal,
                    "endDerivative" : lastNormal * definition.endNormal
                });
    }
    catch (error)
    {
        throw regenError("Path is probably self-intersecting");
    }

    return {
            "desiredEdge" : qCreatedBy(id + "fitSpline1", EntityType.EDGE),
            "bodiesToDelete" : append(bodiesToDelete, qCreatedBy(id + "fitSpline1")),
            "firstPoint" : points[0],
            "firstNormal" : firstNormal,
            "lastNormal" : lastNormal,
        };
}

function wireDiameter(gauge)
{
    return 0.005 * inch * 92 ^ ((36 - gauge) / 39);
}
