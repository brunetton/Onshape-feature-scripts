// https://cad.onshape.com/documents/57ef018093832a1090983bfe/w/58bcbe4474554bfb72f7ecbe/e/693ab83d0b5491ee0aeafc15

FeatureScript 422;
export import(path : "onshape/std/geometry.fs", version : "422.0");

export enum SPACING_TYPE
{
    annotation { "Name" : "Evenly spaced" }
    EVEN,
    annotation { "Name" : "Specific distance" }
    DISTANCE
}

type Path typecheck isPath;

export predicate isPath(value)
{
    value is map;
    value.edges is array;
    value.flipped is array;
}

annotation { "Feature Type Name" : "Curve Pattern Normal",
        "Manipulator Change Function" : "curvePatternManipulatorChange",
        "Editing Logic Function" : "curvePatternEditLogic" }
export const edgePattern = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        // main things
        annotation { "Name" : "Pattern type" }
        definition.patternType is PatternType;

        if (definition.patternType == PatternType.PART)
        {
            booleanStepTypePredicate(definition);

            annotation { "Name" : "Entities to pattern", "Filter" : EntityType.BODY }
            definition.bodies is Query;
        }
        else if (definition.patternType == PatternType.FACE)
        {
            annotation { "Name" : "Faces to pattern",
                        "UIHint" : "ALLOW_FEATURE_SELECTION",
                        "Filter" : EntityType.FACE && ConstructionObject.NO && SketchObject.NO }
            definition.faces is Query;
        }
        else if (definition.patternType == PatternType.FEATURE)
        {
            annotation { "Name" : "Features to pattern" }
            definition.instanceFunction is FeatureList;
        }

        // path
        annotation { "Name" : "Edge(s) to pattern along", "Filter" : (EntityType.EDGE && ConstructionObject.NO) || (EntityType.BODY && BodyType.WIRE)}
        definition.edges is Query;

        annotation { "Name" : "Opposite path direction", "Default" : false }
        definition.oppositeDirection is boolean;

        // other options
        annotation { "Name" : "Reference axis", "Filter" : QueryFilterCompound.ALLOWS_AXIS, "MaxNumberOfPicks" : 1 }
        definition.axis is Query;

        annotation { "Name" : "Opposite axis direction", "Default" : false }
        definition.oppositeAxisDirection is boolean;

        annotation { "Name" : "Reference surfaces", "Filter" : EntityType.FACE }
        definition.surfaces is Query;

        annotation { "Name" : "Skip first instance", "Default" : true }
        definition.skipFirst is boolean;

        annotation { "Name" : "Delete original", "Default" : false }
        definition.delete is boolean;

        // orientation
        annotation { "Name" : "Keep body orientation", "Default" : false }
        definition.noRotation is boolean;

        if (!definition.noRotation)
        {
            annotation { "Name" : "Start rotation" }
            isAngle(definition.rotateAngle, {
                            "min" : -TOLERANCE.zeroAngle * radian,
                            "max" : (2 * PI + TOLERANCE.zeroAngle) * radian,
                            (degree) : [0, 0, 360],
                            (radian) : 1
                        } as AngleBoundSpec);

            annotation { "Name" : "Specify end rotation", "Default" : false }
            definition.endRotation is boolean;

            if (definition.endRotation)
            {
                annotation { "Name" : "End rotation" }
                isAngle(definition.endRotateAngle, {
                                "min" : -inf * radian,
                                "max" : inf * radian,
                                (degree) : [-1000, 0, 1000],
                                (radian) : 1
                            } as AngleBoundSpec);
            }
        }

        // spacing
        annotation { "Name" : "Spacing type", "Default" : SPACING_TYPE.EVEN }
        definition.spacing is SPACING_TYPE;

        if (definition.spacing == SPACING_TYPE.EVEN)
        {
            annotation { "Name" : "Number of instances" }
            isInteger(definition.count, {
                            "min" : 1,
                            "max" : 1e9,
                            (unitless) : [1, 10, 10000]
                        } as IntegerBoundSpec);
        }
        else
        {
            annotation { "Name" : "Distance between instances" }
            isLength(definition.distance, LENGTH_BOUNDS);
        }

        if (definition.patternType == PatternType.PART)
        {
            booleanStepScopePredicate(definition);
        }
    }
    {
        var references = [definition.axis, definition.edges];
        if (definition.patternType == PatternType.PART)
        {
            references = append(references, definition.bodies);
        }
        else if (definition.patternType == PatternType.FACE)
        {
            references = append(references, definition.faces);
        }
        var remainingTransform is Transform = getRemainderPatternTransform(context, {
                "references" : qUnion(references)
            });

        // check if anything is selected to be patterened
        if (definition.patternType == PatternType.PART)
        {
            if (size(evaluateQuery(context, definition.bodies)) == 0)
            {
                throw regenError("Select parts to pattern", ["bodies"]);
            }
        }
        else if (definition.patternType == PatternType.FACE)
        {
            if (size(evaluateQuery(context, definition.faces)) == 0)
            {
                throw regenError("Select faces to pattern", ["faces"]);
            }
        }
        else if (definition.patternType == PatternType.FEATURE)
        {
            if (size(definition.instanceFunction) == 0)
            {
                throw regenError("Select features to pattern", ["instanceFunction"]);
            }
        }

        // find a path from all the edges
        var path is Path = findPath(context, id, definition.edges, definition.oppositeDirection);

        // find the length of the path
        var length is ValueWithUnits = myEvLength(context, path);

        if (definition.spacing == SPACING_TYPE.DISTANCE)
        {
            // figure out how many copies we should make
            definition.count = 1 + floor(length / definition.distance + TOLERANCE.zeroLength);
        }

        // set ending angle to the same as start angle if not specifying an end rotation
        if (!definition.endRotation)
        {
            definition.endRotateAngle = definition.rotateAngle;
        }

        // handle faces the same way as bodies
        if (definition.patternType == PatternType.FACE)
        {
            definition.bodies = definition.faces;
        }

        // handle feature pattern, also save originals in case Delete original is checked
        if (definition.patternType == PatternType.FEATURE)
        {
            definition.originalInstanceFunction = definition.instanceFunction;
            definition.instanceFunction = valuesSortedById(context, definition.instanceFunction);
        }

        // find the start and end of the path
        var startEnd is array = myEvTangents(context, path, [0, 1]);

        // try to find an axis
        var axis;
        try silent
        {
            // did the user pick something
            axis = evAxis(context, { "axis" : definition.axis });
        }
        if (axis == undefined)
        {
            // no reference axis specified, check if the line touches the body at start/end,
            // and use that part of the line as the axis if so
            if (size(evaluateQuery(context, qContainsPoint(definition.bodies, startEnd[0].origin))) > 0)
            {
                axis = startEnd[0];
            }
            else if (size(evaluateQuery(context, qContainsPoint(definition.bodies, startEnd[1].origin))) > 0)
            {
                axis = startEnd[1];
            }
            else
            {
                // no reference axis, and path doesn't start/end on bodies
                // just use the start of the line
                // this may look odd if the line starts far from the body
                reportFeatureInfo(context, id, "For best results, select a reference axis");
                axis = startEnd[0];
            }
        }

        if (definition.oppositeAxisDirection)
        {
            axis.direction *= -1;
        }

        // check if the path is closed
        var closed is boolean = tolerantEquals(startEnd[0].origin, startEnd[1].origin);

        var parameters is array = makeArray(definition.count);
        parameters[0] = 0;
        var step;
        if (definition.spacing == SPACING_TYPE.DISTANCE)
        {
            // make one each distance
            step = definition.distance / length;
        }
        else
        {
            // make n evenly spaced
            step = 1 / (closed ? definition.count : definition.count - 1);
        }
        for (var i = 1; i < definition.count; i += 1)
        {
            parameters[i] = i * step;
        }

        // add manipulator(s) if needed
        if (!definition.noRotation)
        {
            addManipulators(context, id, {
                        "rotateManip" : angularManipulator({
                                    "axisOrigin" : startEnd[0].origin,
                                    "axisDirection" : startEnd[0].direction,
                                    "rotationOrigin" : startEnd[0].origin + perpendicularVector(startEnd[0].direction) * 0.5 * inch,
                                    "angle" : definition.rotateAngle,
                                    "minValue" : 0 * radian,
                                    "maxValue" : 2 * PI * radian
                                }),
                        "endRotateManip" : definition.endRotation ? angularManipulator({
                                        "axisOrigin" : startEnd[1].origin,
                                        "axisDirection" : startEnd[1].direction,
                                        "rotationOrigin" : startEnd[1].origin + perpendicularVector(startEnd[1].direction) * 0.5 * inch,
                                        "angle" : definition.endRotateAngle,
                                        "minValue" : -1000 * radian,
                                        "maxValue" : 1000 * radian
                                    }) : undefined
                    });
        }

        // compute tangents to the path at the needed parameters
        var tangentLines is array = myEvTangents(context, path, parameters);

        var sweepSuccess is boolean = false; // The sweep will fail if the path is not smooth
        var tangentPlanes is array = makeArray(size(tangentLines));
        try silent // suppress the sweep failed error, since this will reportFeatureInfo in the catch block
        {

            // try to find a surface
            var surfaces;
            // did the user pick something
            surfaces = evSurfaceDefinition(context, { "face" : definition.surfaces });

            var normalFaces;

            if (size(evaluateQuery(context, definition.surfaces)) > 0 )
                normalFaces = definition.surfaces;
            else
            {
                // sweep along the path
                var sketch1 = newSketchOnPlane(context, id + "sketch", {
                        "sketchPlane" : plane(tangentLines[0].origin, tangentLines[0].direction)
                    });
                const sweepSize is number = 0.01;
                skRectangle(sketch1, "rectangle1", {
                            "firstCorner" : vector(-sweepSize / 2, sweepSize) * inch,
                            "secondCorner" : vector(sweepSize / 2, 0) * inch
                        });
                skSolve(sketch1);
                opSweep(context, id + "sweep1", {
                            "profiles" : qSketchRegion(id + "sketch", true),
                            "path" : definition.edges
                        });

                // query for the faces along the sweep
                normalFaces = qCreatedBy(id + "sweep1", EntityType.FACE);
                normalFaces = qSubtraction(normalFaces, qUnion([qCapEntity(id + "sweep1", true), qCapEntity(id + "sweep1", false)]));
            }

            var i is number = 0;
            for (var tangentLine in tangentLines)
            {
                // the line goes down the center of one of the sweep faces, so the same side of the sweep will always be the closest to the tangent line
                var distanceResult is DistanceResult = evDistance(context, { "side0" : normalFaces, "side1" : tangentLine.origin });
                var index = distanceResult.sides[0].index;
                var parameter = distanceResult.sides[0].parameter;
                var tangentPlane is Plane = evFaceTangentPlane(context, {
                        "face" : qNthElement(normalFaces, index),
                        "parameter" : parameter
                    });
                tangentPlane.x = tangentLine.direction;
                tangentPlanes[i] = tangentPlane;
                i += 1;
            }
            sweepSuccess = true;
        }
        catch
        {
            reportFeatureInfo(context, id, "For best results, use a smooth path that doesn't intersect itself");
            for (var i = 0; i < size(tangentLines); i += 1)
            {
                var tangentLine is Line = tangentLines[i];
                tangentPlanes[i] = plane(tangentLine.origin, perpendicularVector(tangentLine.direction), tangentLine.direction);
            }
        }
        var transforms is array = makeArray(definition.count);
        var names is array = makeArray(definition.count);
        var prevTangent is Line = axis;
        var angleOffset0 is ValueWithUnits = 0 * radian;
        var rotationStep is ValueWithUnits = (definition.endRotateAngle - definition.rotateAngle) / definition.count;
        var i is number = 0;
        for (var tangentPlane in tangentPlanes)
        {
            names[i] = "pattern" ~ i;
            if (definition.noRotation)
            {
                // only translate
                transforms[i] = transform(tangentPlane.origin - axis.origin);
            }
            else
            {
                if (sweepSuccess)
                {
                    // transform to be tangent to the curve
                    var transform is Transform = transform(axis, line(tangentPlane.origin, tangentPlane.x));
                    // rotate about the curve based on the normal from the sweep
                    var origin = transform * axis.origin;
                    var normal = transform * (axis.origin + perpendicularVector(axis.direction) * inch) - origin;
                    var angleOffset = angleBetween(normal, tangentPlane.normal);
                    var scale = dot(cross(normal, tangentPlane.normal), tangentPlane.x) > 0 ? 1 : -1;
                    angleOffset *= scale;
                    if (i == 0)
                    {
                        // don't rotate the 1st instance based on the sweep, just look at the offset and make subsequent instances match
                        angleOffset0 = angleOffset;
                    }
                    transform = rotationAround(line(tangentPlane.origin, tangentPlane.x), angleOffset - angleOffset0) * transform;
                    // add rotation from manipulators
                    transform = rotationAround(line(tangentPlane.origin, tangentPlane.x), definition.rotateAngle + i * rotationStep) * transform;
                    transforms[i] = transform;
                }
                else
                {
                    // if the sweep failed, just transform from the previous tangent line to this one
                    // this will still work well for 2D curves
                    if (i > 0)
                    {
                        // transfrom to be tangent, then rotate about axis
                        transforms[i] = rotationAround(line(tangentPlane.origin, tangentPlane.x), rotationStep) * transform(prevTangent, line(tangentPlane.origin, tangentPlane.x)) * transforms[i - 1];
                    }
                    else
                    {
                        transforms[i] = rotationAround(line(tangentPlane.origin, tangentPlane.x), definition.rotateAngle) * transform(axis, line(tangentPlane.origin, tangentPlane.x));
                    }
                    prevTangent = line(tangentPlane.origin, tangentPlane.x);
                }
            }
            i += 1;
        }

        if (definition.skipFirst)
        {
            if (closed)
            {
                transforms = resize(transforms, size(transforms)-1);
                names = resize(names, size(names)-1);
            }

            transforms = reverse(transforms);
            names = reverse(names);
            transforms = resize(transforms, size(transforms)-1);
            names = resize(names, size(names)-1);
            transforms = reverse(transforms);
            names = reverse(names);
        }

        // actually do the pattern
        definition.entities = definition.bodies;
        definition.instanceNames = names;
        definition.transforms = transforms;
        applyPattern(context, id + "pattern", definition, remainingTransform);

        // delete the original if needed
        if (definition.delete)
        {
            if (definition.patternType == PatternType.FEATURE)
            {
                // try deleting the features
                var i = 0;
                for (var entry in definition.originalInstanceFunction)
                {
                    try // this won't work when this feature gets feature patterned
                    {
                        opDeleteBodies(context, id + "delete" + i, { "entities" : qCreatedBy(entry.key) });
                    }
                    i += 1;
                }
            }
            else
            {
                try
                {
                    // try deleting the bodies
                    opDeleteBodies(context, id + "delete", { "entities" : definition.bodies });
                }
            }
        }

        // delete the sweep and sketch
        try silent // deleting the sweep will fail if the sweep failed
        {
            opDeleteBodies(context, id + "deleteSketch", {
                        "entities" : qCreatedBy(id + "sketch", EntityType.BODY)
                    });
            opDeleteBodies(context, id + "deleteSweep", {
                        "entities" : qCreatedBy(id + "sweep1", EntityType.BODY)
                    });
        }
    }, { /* default parameters */ });

export function curvePatternManipulatorChange(context is Context, definition is map, newManipulators is map) returns map
{
    var rotateManip = newManipulators.rotateManip;
    var endRotateManip = newManipulators.endRotateManip;
    if (rotateManip != undefined)
    {
        definition.rotateAngle = rotateManip.angle;
    }
    if (endRotateManip != undefined)
    {
        definition.endRotateAngle = endRotateManip.angle;
    }
    return definition;
}

export function curvePatternEditLogic(context is Context, id is Id, oldDefinition is map, definition is map, specifiedParameters is map) returns map
{
    // delete original by default if the edge intersects the body
    if (!specifiedParameters.delete)
    {
        try
        {
            var path is Path = findPath(context, id, definition.edges, definition.oppositeDirection);
            var startEnd is array = myEvTangents(context, path, [0, 1]);

            if (size(evaluateQuery(context, qContainsPoint(definition.bodies, startEnd[0].origin))) > 0)
            {
                definition.delete = true;
            }
            else if (size(evaluateQuery(context, qContainsPoint(definition.bodies, startEnd[1].origin))) > 0)
            {
                definition.delete = true;
            }
        }
    }
    return definition;
}

/**
 * Creates a Path from the given edges
 * Throws if a Path cannot be created
 */
function findPath(context is Context, id is Id, edgesQuery is Query, oppositeDirection is boolean) returns Path
{
    var edges is array = evaluateQuery(context, edgesQuery);

    if (size(edges) == 0)
    {
        throw regenError("Path cannot be empty", ["edges"]);
    }

    if (size(edges) == 1)
    {
        // nothing to do
        return { "edges" : edges, "flipped" : [oppositeDirection] } as Path;
    }

    var endPoints is array = makeArray(size(edges) * 2); // the start and end points of each edge
    var index = 0;
    for (var edge in edges)
    {
        // get all the start and end points
        var startEnd is array = evEdgeTangentLines(context, {
                "edge" : edge,
                "parameters" : [0, 1],
                "arcLengthParameterization" : false
            });
        endPoints[index] = startEnd[0].origin;
        endPoints[index + 1] = startEnd[1].origin;
        index += 2;
    }

    var pointGroups is array = clusterPoints(endPoints, TOLERANCE.zeroLength);

    var oddNumberedGroups = 0;
    var edgeMap = {}; // map of endpoint to the group of endpoints containing it
    var edgeIndex;

    for (var group in pointGroups)
    {
        if (size(group) % 2 == 1)
        {
            // need to start (and end) at odd sized groups (if they exist)
            oddNumberedGroups += 1;
            if (edgeIndex == undefined)
            {
                edgeIndex = group[0];
            }
        }

        for (var index in group)
        {
            edgeMap[index] = group;
        }
    }

    if (edgeIndex == undefined)
    {
        // start at the first edge the user selected if it is a closed path
        edgeIndex = 0;
        // if the start of the first edge touches the second edge, start at the end of the first edge
        if (isIn(2, edgeMap[0]) || isIn(3, edgeMap[0]))
        {
            edgeIndex = 1;
        }
    }

    if (oddNumberedGroups != 0 && oddNumberedGroups != 2)
    {
        // not possible to traverse all the edges, even if they all touch
        // for example, a T shape
        throw regenError("Invalid path: check that path is continous", ["edges"]);
    }

    var groupResult = groupEdges(0, edges, edgeIndex, makeArray(size(edges)), makeArray(size(edges)), edgeMap, {});
    var result = groupResult[0];
    var flipped = groupResult[1];

    for (var index in result)
    {
        if (index == undefined)
        {
            // some of the edges couldn't be added to the path
            throw regenError("Invalid path: check that path is continous", ["edges"]);
        }
    }

    result = mapArray(result, function(index)
        {
            return edges[index];
        });

    if (oppositeDirection)
    {
        result = reverse(result);
        flipped = reverse(flipped);
        flipped = mapArray(flipped, function(x)
            {
                return !x;
            });
    }

    return { "edges" : result, "flipped" : flipped } as Path;
}

function groupEdges(startIndex, edges, edgeIndex, result, flipped, edgeMap, used)
{
    for (var i = startIndex; i < size(edges); i += 1)
    {
        var edge = floor(edgeIndex / 2);
        var flip = edgeIndex % 2 == 1; // flip this edge if we are starting at the end of it

        result[i] = edge;
        flipped[i] = flip;

        // find the other end of this edge
        var otherEnd = flip ? edgeIndex - 1 : edgeIndex + 1;
        var nextGroup = edgeMap[otherEnd];
        used[edgeIndex] = true;
        used[otherEnd] = true;

        if (size(nextGroup) == 1)
        {
            // reached the end of the path; this edge doesn't touch anything else
            break;
        }
        else if (size(nextGroup) == 2)
        {
            var newIndex;
            for (var index in nextGroup)
            {
                if (used[index] != true)
                {
                    newIndex = index;
                    break;
                }
            }
            if (newIndex == undefined)
            {
                // already used all the edges at this intersection
                break;
            }
            edgeIndex = newIndex;
        }
        else
        {
            // more than 2 edges meet here, pick one and recurse; if that fails, try another one
            for (var index in nextGroup)
            {
                if (used[index] != true)
                {
                    var groupResult = groupEdges(i + 1, edges, index, result, flipped, edgeMap, used);
                    if (groupResult[0][size(result) - 1] != undefined)
                    {
                        // found a valid result
                        result = groupResult[0];
                        flipped = groupResult[1];
                        break;
                    }
                }
            }
            // already used all the edges at this intersection, or unable to find a valid path
            break;
        }
    }
    return [result, flipped];
}

/**
 * returns the total length of a Path
 */
function myEvLength(context is Context, path is Path) returns ValueWithUnits
{
    return evLength(context, {
                "entities" : qUnion(path.edges)
            });
}

/**
 * returns an array of tangent lines, corresponding to the given parameters on the Path
 */
function myEvTangents(context is Context, path is Path, parameters is array) returns array
{
    var totalLength is ValueWithUnits = myEvLength(context, path);
    var lengths is array = [];
    for (var i = 0; i < size(path.edges); i += 1)
    {
        lengths = append(lengths, evLength(context, {
                        "entities" : path.edges[i]
                    }));
    }

    var edgeParams is array = [0];
    for (var i = 1; i < size(path.edges); i += 1)
    {
        edgeParams = append(edgeParams, edgeParams[i - 1] + lengths[i - 1] / totalLength);
    }
    edgeParams = append(edgeParams, 1);

    var results is array = [];
    for (var param in parameters)
    {
        var index is number = 0;
        var adjustedParameter is number = 0;
        var flip is boolean = false;
        // find which line to look at, and the parameter on that line
        for (var i = 0; i < size(edgeParams) - 1; i += 1)
        {
            if (param >= edgeParams[i] && param <= edgeParams[i + 1])
            {
                index = i;
                flip = path.flipped[i];
                var paramWithFlip is number = flip ? edgeParams[i + 1] - param : param - edgeParams[i];
                adjustedParameter = paramWithFlip / (edgeParams[i + 1] - edgeParams[i]);
                break;
            }
        }

        var result is Line = evEdgeTangentLine(context, {
                "edge" : path.edges[index],
                "parameter" : adjustedParameter
            });
        if (flip)
        {
            result.direction *= -1;
        }
        results = append(results, result);
    }
    return results;
}
