// https://cad.onshape.com/documents/2ce3e64026df1ac7e63b98bd/w/7a2029e15b241c80c591a492/e/74ed94c52f61d01d37dc9f17

FeatureScript 1378;
import(path : "onshape/std/geometry.fs", version : "1378.0");
import(path : "onshape/std/sheetMetalUtils.fs", version : "1378.0");

// This is a library for computing a minimum bounding box.
import(path : "d41ef62ff9b7c703c4e0afba/fe030c47471db47905e94090/dc97a57ebdf1da670f50657a", version : "dad7feb93e2ca82e8b8eae13");



export enum BoundsFeatureResult
{
    annotation { "Name" : "Create bounding tool" }
    PART,
    annotation { "Name" : "Print results to console" }
    PRINT
}

export enum UnitOutput
{
    annotation { "Name" : "millimeters" }
    millimeter,
    annotation { "Name" : "centimeters" }
    centimeter,
    annotation { "Name" : "meters" }
    meter,
    annotation { "Name" : "inches" }
    inch,
    annotation { "Name" : "feet" }
    foot,
    annotation { "Name" : "yards" }
    yard
}

const EDGE_SAMPLE_BOUNDS = { (unitless) : [2, 10, 100] } as IntegerBoundSpec;

/**
 * Creates bounds around specified parts.
 */
annotation { "Feature Type Name" : "Calculate bounds", "Editing Logic Function" : "calculateBoundsEditLogic" }
export const calculateBounds = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Feature result", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.featureResult is BoundsFeatureResult;

        if (definition.featureResult == BoundsFeatureResult.PRINT)
            annotation { "Name" : "Results in:", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.unitOutput is UnitOutput;

        annotation { "Name" : "Bound all" }
        definition.defaultScope is boolean;

        if (!definition.defaultScope)
            annotation { "Name" : "Entities to bound", "Filter" : (EntityType.BODY && AllowFlattenedGeometry.YES) ||
                            ((BodyType.POINT || BodyType.MATE_CONNECTOR) && EntityType.VERTEX) }
            definition.bodies is Query;

        // This is a parameter that tells the feature if it could possibly use the sheet metal flat pattern
        annotation { "UIHint" : UIHint.ALWAYS_HIDDEN }
        definition.sheetMetal is boolean;

        if (definition.sheetMetal && !definition.defaultScope)
            annotation { "Name" : "Use flat pattern" }
            definition.useFlat is boolean;

        annotation { "Name" : "Calculate smallest bounds", "Default" : true, "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.calculateSmallest is boolean;

        if (definition.calculateSmallest)
            annotation { "Name" : "Samples per edge", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
            isInteger(definition.edgeSamples, EDGE_SAMPLE_BOUNDS);

        else
        {
            annotation { "Name" : "Use default coordinate system", "Default" : true }
            definition.defaultCSys is boolean;

            if (!definition.defaultCSys)
            {
                if (definition.sheetMetal && !definition.defaultScope && definition.useFlat)
                    annotation { "Name" : "Two points for bounds alignment", "Filter" : EntityType.VERTEX && AllowFlattenedGeometry.YES, "MaxNumberOfPicks" : 2 }
                    definition.alignEdge is Query;

                else
                    annotation { "Name" : "Mate connector for coordinate system", "Filter" : BodyType.MATE_CONNECTOR, "MaxNumberOfPicks" : 1 }
                    definition.mateConnector is Query;
            }
        }
    }
    {
        // If the user selects print, tell them how to open the console
        if (definition.featureResult == BoundsFeatureResult.PRINT)
            reportFeatureInfo(context, id, "Press the {✓} button above this notification to open the console.");

        // If it isn't using the flat pattern
        if (!definition.sheetMetal || definition.defaultScope || !definition.useFlat)
        {
            const bodies = definition.defaultScope ?

                qEverything(EntityType.BODY)
->qBodyType([BodyType.SOLID, BodyType.SHEET])
->qConstructionFilter(ConstructionObject.NO)
->qModifiableEntityFilter()
->qMeshGeometryFilter(MeshGeometry.NO)
->qSketchFilter(SketchObject.NO)
->qSheetMetalFlatFilter(SMFlatType.NO) :
                qUnion([
                            definition.bodies->qEntityFilter(EntityType.BODY)->qSheetMetalFlatFilter(SMFlatType.NO),
                            // Owner bodies of sheet metal faces
                            getSMCorrespondingInPart(
                                    context,
                                    definition.bodies,
                                    EntityType.FACE
                                )->qOwnerBody(),
                            // Sheet metal parts (If the user selects the flat pattern)
                            getSMCorrespondingInPart(
                                context,
                                definition.bodies,
                                EntityType.BODY
                            )
                        ]);

            const vertices = definition.defaultScope ? qUnion([]) : qEntityFilter(definition.bodies, EntityType.VERTEX);

            const entities = qUnion(evaluateQuery(context, qUnion([bodies, vertices])));

            const hasBodies = evaluateQuery(context, bodies) != [];

            if (entities.subqueries == [])
            {
                if (definition.defaultScope)
                    throw regenError(ErrorStringEnum.CANNOT_BE_EMPTY);

                else
                    throw regenError(ErrorStringEnum.CANNOT_RESOLVE_ENTITIES, ["bodies"]);
            }

            // Set definition.bodies for the coord system calculation
            definition.bodies = entities;

            const cSys = findOrConstruct3dBoxCSys(context, id + "coordSystem", definition, hasBodies);

            // Calculate the bounding box
            const bbox = evBox3d(context, {
                        "topology" : entities,
                        "tight" : true,
                        "cSys" : cSys
                    });

            // Display the bounding box
            displayOrConstructBoundingBox(context, id + "display", id, definition.featureResult, cSys, bbox);

            if (definition.featureResult == BoundsFeatureResult.PRINT)
            {
                // Print the result to the FS Console
                const unitInfo = getUnitAndUnitString(definition.unitOutput);
                const extents = getExtents(bbox, 3, unitInfo.lengthUnit);
                const length = extents.length;
                const width = extents.width;
                const height = extents.height;
                var volume = roundToPrecision(length * width * height, 3);
                println("Evaluating extents of selected parts.");
                println("Length is along x (red) axis, width is along y (green) axis, height is along z (blue) axis.");
                println("Length: " ~ length ~ " " ~ (length == 1 ? unitInfo.lengthStringSingle : unitInfo.lengthString));
                println("Width:  " ~ width ~ " " ~ (width == 1 ? unitInfo.lengthStringSingle : unitInfo.lengthString));
                println("Height: " ~ height ~ " " ~ (height == 1 ? unitInfo.lengthStringSingle : unitInfo.lengthString));

                if (definition.unitOutput == UnitOutput.millimeter)
                {
                    volume = roundToPrecision(volume / 1000, 3);
                    println("Volume: " ~ volume ~ " cubic " ~ (volume == 1 ? "centimeter" : "centimeters"));
                }
                else
                    println("Volume: " ~ volume ~ " cubic " ~ (volume == 1 ? unitInfo.lengthStringSingle : unitInfo.lengthString));

                println();
            }
        }
        else
        {
            definition.face = evaluateQuery(
                        context,
                        qUnion([qSheetMetalFlatFilter(definition.bodies, SMFlatType.YES), qCorrespondingInFlat(definition.bodies)])
->qOwnedByBody(EntityType.FACE)
->qGeometry(GeometryType.PLANE)
->qParallelPlanes(Z_DIRECTION, false)
                    )[0];
            calculateFlatSMBounds(context, id, definition);
        }
    }, {
            featureResult : BoundsFeatureResult.PART,
            defaultScope : false,
            sheetMetal : false,
            useFlat : true,
            calculateSmallest : true,
            edgeSamples : 10,
            defaultCSys : true
        });

export function calculateBoundsEditLogic(context is Context, id is Id, oldDefinition is map, definition is map, isCreating is boolean) returns map
{
    if (definition.defaultScope)
    {
        definition.sheetMetal = false;
        return definition;
    }

    const separatedSMQs = separateSheetMetalQueries(context, qOwnerBody(definition.bodies));
    const partSize = size(evaluateQuery(context, separatedSMQs.nonSheetMetalQueries));
    if (partSize != 0)
    {
        definition.sheetMetal = false;
        return definition;
    }

    const smSize = size(evaluateQuery(context, qUnion([
                        qSheetMetalFlatFilter(separatedSMQs.sheetMetalQueries, SMFlatType.YES),
                        qCorrespondingInFlat(separatedSMQs.sheetMetalQueries)
                    ])));

    if (smSize == 1)
        definition.sheetMetal = true;
    else
        definition.sheetMetal = false;

    return definition;
}

/**
 * Finds the coordsystem that should be used to construct the box based on the user's selections
 */
function findOrConstruct3dBoxCSys(context is Context, id is Id, definition is map, hasBodies is boolean)
{
    var cSys = WORLD_COORD_SYSTEM;
    if (definition.calculateSmallest)
    {
        const vertexPoints = mapArray(evaluateQuery(context, qEntityFilter(definition.bodies, EntityType.VERTEX)), function(vertex)
            {
                return evVertexPoint(context, {
                            "vertex" : vertex
                        });
            });
        var t = identityTransform();

        const bodiesLeft = qSubtraction(definition.bodies, qEntityFilter(definition.bodies, EntityType.VERTEX));

        const center is Vector = hasBodies ? evApproximateCentroid(context, {
                        "entities" : bodiesLeft
                    }) : vector(0, 0, 0) * meter;
        // Calculate the smallest bounding box

        // This algorithm is from http://sffsymposium.engr.utexas.edu/Manuscripts/1999/1999-019-Chan.pdf
        // Update (2020-10-21): Link is now https://repositories.lib.utexas.edu/bitstream/handle/2152/73594/1999-019-Chan.pdf?sequence=2&isAllowed=y


        // Z Projection {

        // We need to check the direction, since opCreateOutline doesn't work if the plane is the wrong way.
        const zPlane = checkDir(t * XY_PLANE, center);

        const zPlaneId = id + "zPlane";

        opPlane(context, zPlaneId, {
                    "plane" : zPlane,
                    "width" : 0.01 * meter,
                    "height" : 0.01 * meter
                });

        // Project the part onto the XY plane
        const zProjectId = id + "zProject";

        if (hasBodies)
            opCreateOutline(context, zProjectId, {
                        "tools" : bodiesLeft,
                        "target" : qCreatedBy(zPlaneId, EntityType.FACE)
                    });

        const zMinimumBox = calculateMinBox(context, qCreatedBy(zProjectId, EntityType.FACE), vertexPoints, zPlane, definition.edgeSamples);

        t = rotationAround(line(WORLD_ORIGIN, Z_DIRECTION), fixAngle(zMinimumBox.angle)) * t;

        // }


        // Y Projection {

        // We need to check the direction, since opCreateOutline doesn't work if the plane is the wrong way.
        const yPlane = checkDir(t * XZ_PLANE, center);

        const yPlaneId = id + "yPlane";

        opPlane(context, yPlaneId, {
                    "plane" : yPlane,
                    "width" : 0.01 * meter,
                    "height" : 0.01 * meter
                });

        const yProjectId = id + "yProject";

        if (hasBodies)
            opCreateOutline(context, yProjectId, {
                        "tools" : bodiesLeft,
                        "target" : qCreatedBy(yPlaneId, EntityType.FACE)
                    });

        const yMinimumBox = calculateMinBox(context, qCreatedBy(yProjectId, EntityType.FACE), vertexPoints, yPlane, definition.edgeSamples);

        t = rotationAround(line(WORLD_ORIGIN, yPlane.normal), fixAngle(yMinimumBox.angle)) * t;

        // }


        // X Projection {

        // We need to check the direction, since opCreateOutline doesn't work if the plane is the wrong way.
        const xPlane = checkDir(t * YZ_PLANE, center);

        const xPlaneId = id + "xPlane";
        opPlane(context, xPlaneId, {
                    "plane" : xPlane,
                    "width" : 0.01 * meter,
                    "height" : 0.01 * meter
                });

        const xProjectId = id + "xProject";

        if (hasBodies)
            opCreateOutline(context, xProjectId, {
                        "tools" : bodiesLeft,
                        "target" : qCreatedBy(xPlaneId, EntityType.FACE)
                    });

        const xMinimumBox = calculateMinBox(context, qCreatedBy(xProjectId, EntityType.FACE), vertexPoints, xPlane, definition.edgeSamples);

        t = rotationAround(line(WORLD_ORIGIN, xPlane.normal), fixAngle(xMinimumBox.angle)) * t;
        // }

        cSys = t * cSys;
    }
    else if (!definition.defaultCSys)
    {
        // Check that there is a mate connector selected
        if (size(evaluateQuery(context, definition.mateConnector)) == 0)
            throw regenError(ErrorStringEnum.CANNOT_RESOLVE_ENTITIES, ["mateConnector"]);

        cSys = evMateConnector(context, {
                    "mateConnector" : definition.mateConnector
                });
    }
    cSys.origin = WORLD_ORIGIN;

    // Delete leftovers
    if (evaluateQuery(context, qCreatedBy(id)) != [])
        opDeleteBodies(context, id + "delete", {
                    "entities" : qCreatedBy(id)
                });

    return cSys;
}

function checkDir(plane is Plane, centerPoint is Vector) returns Plane
{
    // We need to make sure that the plane points towards the center of the parts, otherwise the imprint fails.
    if (dot(plane.normal, centerPoint - plane.origin) < 0)
        plane.normal *= -1;
    return plane;
}

function fixAngle(angle is ValueWithUnits) returns ValueWithUnits
{
    return angle > 45 * degree + TOLERANCE.zeroAngle * radian ? angle - 90 * degree : angle;
}

/**
 * Calculates the bounds and sketches them on the flat pattern
 */
function calculateFlatSMBounds(context is Context, id is Id, definition is map)
{
    const flatFace = definition.face;

    const flatFaces = qTangentConnectedFaces(flatFace);
    // We use evPlane here because it is what newSketch uses
    const flatFacePlane = evPlane(context, {
                "face" : flatFace
            });

    const points = getBoxPoints(context, flatFaces, [], flatFacePlane, definition.edgeSamples);

    var boundingBox;

    if (definition.calculateSmallest)
        boundingBox = calculateMinBox(context, flatFaces, [], flatFacePlane, definition.edgeSamples);

    else
    {
        var boxXDirection;
        if (definition.defaultCSys)
            boxXDirection = X_DIRECTION;
        else
        {
            if (size(evaluateQuery(context, definition.alignEdge)) != 2)
                throw regenError("Please select two points to align the bounds", ["alignEdge"]);

            else
            {
                const boxXPoints = qUnion([qSheetMetalFlatFilter(definition.alignEdge, SMFlatType.YES), qCorrespondingInFlat(definition.alignEdge)]);
                boxXDirection = evVertexPoint(context, {
                                "vertex" : qNthElement(boxXPoints, 0)
                            }) - evVertexPoint(context, {
                                "vertex" : qNthElement(boxXPoints, 1)
                            });
            }
        }
        const angle = atan2(boxXDirection[1], boxXDirection[0]) % (PI / 2 * radian);
        boundingBox = getBox2D(points, angle);
    }

    const box3dCSys = coordSystem(WORLD_ORIGIN, vector(cos(boundingBox.angle), sin(boundingBox.angle), 0), Z_DIRECTION);

    const box3d = evBox3d(context, {
                "topology" : flatFaces,
                "tight" : true,
                "cSys" : box3dCSys
            });

    const boxPoints = [
            box3d.minCorner,
            vector(box3d.minCorner[0], box3d.maxCorner[1], 0 * meter),
            box3d.maxCorner,
            vector(box3d.maxCorner[0], box3d.minCorner[1], 0 * meter)
        ];

    var sketchBoxPoints = mapArray(boxPoints, function(point)
    {
        return worldToPlane(flatFacePlane, toWorld(box3dCSys, point));
    });

    sketchBoxPoints = append(sketchBoxPoints, sketchBoxPoints[0]);

    const sketch = newSketch(context, id + "sketch", {
                "sketchPlane" : flatFace
            });

    skPolyline(sketch, "polyline", {
                "points" : sketchBoxPoints,
                "construction" : true
            });

    skSolve(sketch);

    if (definition.featureResult == BoundsFeatureResult.PRINT)
    {
        // Print the result to the FS Console
        const unitInfo = getUnitAndUnitString(definition.unitOutput);
        const extents = getExtents(boundingBox, 3, unitInfo.lengthUnit);
        const length = extents.width;
        const width = extents.height;
        println("Evaluating extents of selected sheet metal part.");
        println("Length: " ~ length ~ " " ~ (length == 1 ? unitInfo.lengthStringSingle : unitInfo.lengthString));
        println("Width:  " ~ width ~ " " ~ (width == 1 ? unitInfo.lengthStringSingle : unitInfo.lengthString));
        println("Angle:  " ~ roundToPrecision(extents.angle / degree, 3) ~ " degrees");
        println();


        setErrorEntities(context, id, {
                    "entities" : qCreatedBy(id + "sketch", EntityType.EDGE)
                });
        opDeleteBodies(context, id + "deleteSketch", {
                    "entities" : qCreatedBy(id + "sketch")
                });
    }
}

function getBoxPoints(context is Context, faces is Query, extraPoints is array, plane is Plane, edgeSamples)
{
    const points = mapArray(
            concatenateArrays([
                    mapArray(
                        evaluateQuery(context, qAdjacent(faces, AdjacencyType.VERTEX, EntityType.VERTEX)),
                        function(vertex)
                    {
                        return evVertexPoint(context, {
                                    "vertex" : vertex
                                });
                    }),
                    extraPoints
                ]),
            function(point)
        {
            return worldToPlane(plane, point);
        });

    const adjacentEdges = qAdjacent(faces, AdjacencyType.EDGE, EntityType.EDGE);
    const nonLinearEdges = evaluateQuery(context, qSubtraction(adjacentEdges, qGeometry(adjacentEdges, GeometryType.LINE)));

    var nonLinearEdgePoints = makeArray(size(nonLinearEdges) * edgeSamples);

    const offsetFromEnds = 1 / (edgeSamples + 1);

    const edgeParameters = range(offsetFromEnds, 1, edgeSamples);

    for (var i = 0; i < size(nonLinearEdges); i += 1)
    {
        const edgeVertices = mapArray(evEdgeTangentLines(context, {
                        "edge" : nonLinearEdges[i],
                        "parameters" : edgeParameters
                    }), function(line)
            {
                return line.origin;
            });
        for (var j = 0; j < edgeSamples; j += 1)
        {
            nonLinearEdgePoints[i * edgeSamples + j] = worldToPlane(plane, edgeVertices[j]);
        }
    }

    return mapArray(concatenateArrays([points, nonLinearEdgePoints]), function(point)
        {
            return point / meter;
        });
}

function calculateMinBox(context is Context, faces is Query, extraPoints is array, plane is Plane, edgeSamples)
{
    const points = getBoxPoints(context, faces, extraPoints, plane, edgeSamples);
    return minimumBox2D(points);
}

function calculateMinBox(points is array)
{
    return minimumBox2D(points);
}

function getExtents(bbox is map, decimalPlaces is number, lengthUnit is ValueWithUnits) returns map
{
    for (var extent in ["width", "height"])
    {
        bbox[extent] = roundToPrecision(bbox[extent] * meter / lengthUnit, decimalPlaces);
    }
    return bbox;
}

function getExtents(bbox is Box3d) returns map
{
    return {
            "length" : bbox.maxCorner[0] - bbox.minCorner[0],
            "width" : bbox.maxCorner[1] - bbox.minCorner[1],
            "height" : bbox.maxCorner[2] - bbox.minCorner[2],
        };
}

function getExtents(bbox is Box3d, decimalPlaces is number, lengthUnit is ValueWithUnits) returns map
{
    var extents = getExtents(bbox);
    for (var extent in extents)
        extents[extent.key] = roundToPrecision(extent.value / lengthUnit, decimalPlaces);

    return extents;
}

function displayOrConstructBoundingBox(context is Context, id is Id, topLevelId is Id, featureResult is BoundsFeatureResult, cSys is CoordSystem, bbox is Box3d)
{
    const extents = getExtents(bbox);

    const cuboidId = id + "cuboid";
    fCuboid(context, cuboidId, {
                "corner1" : WORLD_ORIGIN,
                "corner2" : vector(extents.length, extents.width, extents.height)
            });
    const cuboid = qCreatedBy(cuboidId, EntityType.BODY);

    const cSysTransform = toWorld(cSys);
    const minCornerWorld = toWorld(cSys, bbox.minCorner);

    opTransform(context, id + "transform", {
                "bodies" : cuboid,
                "transform" : transform(minCornerWorld) * cSysTransform
            });

    if (featureResult == BoundsFeatureResult.PART)
    {
        setProperty(context, {
                    "entities" : cuboid,
                    "propertyType" : PropertyType.NAME,
                    "value" : "Bounds"
                });
        setProperty(context, {
                    "entities" : cuboid,
                    "propertyType" : PropertyType.APPEARANCE,
                    "value" : color(1, 1, 1, 0.1)
                });
    }
    else
    {
        setErrorEntities(context, topLevelId, {
                    "entities" : cuboid
                });
        opDeleteBodies(context, id + "deleteCuboid", {
                    "entities" : cuboid
                });
    }
}

function getUnitAndUnitString(unitOutput is UnitOutput) returns map
{
    if (unitOutput == UnitOutput.inch)
    {
        return {
                "lengthUnit" : inch,
                "lengthString" : "inches",
                "lengthStringSingle" : "inch"
            };
    }
    else if (unitOutput == UnitOutput.foot)
    {
        return {
                "lengthUnit" : foot,
                "lengthString" : "feet",
                "lengthStringSingle" : "foot"
            };
    }
    else
    {
        return {
                "lengthUnit" : units[toString(unitOutput)],
                "lengthString" : toString(unitOutput) ~ "s",
                "lengthStringSingle" : toString(unitOutput)
            };
    }
}

const units = {
        "inch" : inch,
        "meter" : meter,
        "millimeter" : millimeter,
        "centimeter" : centimeter,
        "yard" : yard,
        "foot" : foot
    };

function println()
{
    println("");
}
