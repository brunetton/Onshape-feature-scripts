// https://cad.onshape.com/documents/5a344daad1ec87e14cdb6dc6/w/9f627cf9b5d269053e17e7ba/e/7eac87a4fe0feec20c29c97d

FeatureScript 701;
import(path : "onshape/std/geometry.fs", version : "701.0");


export enum LineDirection
{
    annotation { "Name" : "( X )" }
    X,
    annotation { "Name" : "( Y )" }
    Y,
    annotation { "Name" : "( Z )" }
    Z
}

export const DIRECTION_VECTOR = {
        LineDirection.X : vector(1, 0, 0),
        LineDirection.Y : vector(0, 1, 0),
        LineDirection.Z : vector(0, 0, 1)
    };

export const DIRECTION_ENUM = {
        vector(1, 0, 0) : LineDirection.X,
        vector(0, 1, 0) : LineDirection.Y,
        vector(0, 0, 1) : LineDirection.Z
    };

annotation { "Feature Type Name" : "Ortho lines", "Manipulator Change Function" : "orthoManipualtor", "Editing Logic Function" : "orthoEditingLogic" }
export const orthoLines = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Starting point", "Filter" : EntityType.VERTEX, "MaxNumberOfPicks" : 1 }
        definition.startingPoint is Query;

        annotation { "Name" : "Arcs" }
        definition.arcs is boolean;

        if (definition.arcs)
        {
            annotation { "Name" : "Arc radius" }
            isLength(definition.arcRadius, LENGTH_BOUNDS);
        }

        annotation { "Name" : "Lines", "Item name" : "Line", "Item label template" : "#direction: #length" }
        definition.lines is array;
        for (var line in definition.lines)
        {
            annotation { "Name" : "Direction", "UIHint" : "DISPLAY_SHORT" }
            line.direction is LineDirection;

            annotation { "Name" : "Highlight", "UIHint" : "DISPLAY_SHORT" }
            line.highlight is boolean;

            annotation { "Name" : "Line length" }
            isLength(line.length, LENGTH_BOUNDS);

            annotation { "Name" : "Anchor vertex or arc", "Filter" : EntityType.VERTEX || GeometryType.CIRCLE || GeometryType.ARC, "MaxNumberOfPicks" : 1 }
            line.offsetVertex is Query;
        }
    }
    {
        var point = evVertexPoint(context, { "vertex" : definition.startingPoint });
        var direction;
        var numLines = size(definition.lines);
        for (var i = 0; i < numLines; i += 1)
        {
            const line = definition.lines[i];
            direction = DIRECTION_VECTOR[line.direction];
            var nextDirection;

            var sketchNormal;
            if (i + 1 < numLines)
            {
                nextDirection = DIRECTION_VECTOR[definition.lines[i + 1].direction];
                if (nextDirection == direction)
                    throw regenError("Directions " ~ (i + 1) ~ " and " ~ (i + 2) ~ " cannot be the same");
                sketchNormal = cross(direction, nextDirection);
            }
            else
            {
                sketchNormal = line.direction == LineDirection.Z ? vector(1, 0, 0) : vector(0, 0, 1);
            }

            var length = segmentLength(context, point, line);
            var newPoint = point + length * direction;

            var sketch = newSketchOnPlane(context, id + i + "sketch", {
                    "sketchPlane" : plane(point, sketchNormal, direction)
                });
            var offset = 0 * meter;
            if (definition.arcs)
                offset = definition.arcRadius * sign(length);

            var start = (definition.arcs && i > 0) ? offset : (0 * meter);
            var end = (definition.arcs && i + 1 < numLines) ? (length - offset) : length;
            skLineSegment(sketch, "line", {
                        "start" : vector(start, 0 * meter),
                        "end" : vector(end, 0 * meter)
                    });
            if (end != length)
            {
                var arcSide = sign(dot(cross(sketchNormal, direction), nextDirection * sign(length) * segmentLength(context, newPoint, definition.lines[i + 1])));
                skArc(sketch, "arc", {
                        "start" : vector(end, 0 * meter),
                        "mid" : vector(end + offset * sqrt(.5), arcSide * offset * (1 - sqrt(0.5))),
                        "end" : vector(end + offset, arcSide * offset)
                });
            }
            skSolve(sketch);
            if (sign(end - start) != sign(length))
            {
                reportFeatureWarning(context, id, "Line segment " ~ (i + 1) ~ " shorter than twice the arc diameter");
            }
            if (line.highlight)
            {
                debug(context, point, newPoint);
                debug(context, newPoint);
            }
            addManipulators(context, id, {
                        (line.direction as string) ~ i : linearManipulator(point, direction, length)
                    });

            point = newPoint;
        }
        if (direction != undefined)
        {
            var up = perpendicularVector(direction);
            var right = cross(direction, up);
            addManipulators(context, id, {
                        (DIRECTION_ENUM[up] as string) ~ numLines : linearManipulator(point, up, 0 * meter),
                        (DIRECTION_ENUM[right] as string) ~ numLines : linearManipulator(point, right, 0 * meter),
                    });
        }
    });

export function orthoManipualtor(context is Context, definition is map, newManipulators is map) returns map
{
    for (var newManipulator in newManipulators)
    {
        var id = newManipulator.key;
        var forwardIndex = replace(newManipulator.key, "[XYZ]", "");
        if (forwardIndex != id)
        {
            var idx = stringToNumber(forwardIndex);
            if (idx == size(definition.lines))
            {
                definition.lines = append(definition.lines, { "direction" : splitIntoCharacters(newManipulator.key)[0] as LineDirection, "length" : 0 * meter });
                definition.lines[idx].length = newManipulator.value.offset;
                return definition;
            }
            var point = evVertexPoint(context, { "vertex" : definition.startingPoint });
            const lines = size(definition.lines);
            for (var i = 0; i <= idx; i += 1)
            {
                var line = definition.lines[i];

                var direction = DIRECTION_VECTOR[line.direction];
                var oldLength = segmentLength(context, point, line);
                point += oldLength * direction;
                if (i == idx)
                    definition.lines[idx].length += newManipulator.value.offset - oldLength;
            }
        }
    }
    return definition;
}

export function orthoEditingLogic(context is Context, id is Id, oldDefinition is map, definition is map, isCreating is boolean) returns map
{
    if (oldDefinition == {})
    {
        if (definition.lines == [])
        {
            definition.lines = [{ "direction" : LineDirection.X, "length" : inch }];
        }
        return definition;
    }
    if (clearHighlights(oldDefinition) == clearHighlights(definition))
    {
        const lines = size(definition.lines);
        for (var i = 0; i < lines; i += 1)
        {
            if (oldDefinition.lines[i].highlight && definition.lines[i].highlight)
                definition.lines[i].highlight = false;
        }
        return definition;
    }
    if (clearOffsets(oldDefinition) == clearOffsets(definition))
    {
        var point = evVertexPoint(context, { "vertex" : definition.startingPoint });
        const lines = size(definition.lines);
        for (var i = 0; i < lines; i += 1)
        {
            var line = definition.lines[i];
            var oldLine = oldDefinition.lines[i];

            var direction = DIRECTION_VECTOR[line.direction];
            var oldLength = segmentLength(context, point, oldLine);
            if (line.offsetVertex != oldLine.offsetVertex)
            {
                var newLength = segmentLength(context, point, line);
                definition.lines[i].length += oldLength - newLength;
            }
            point += oldLength * direction;
        }
    }

    return definition;
}

function sign(value) { return value < 0 ? -1 : 1; }

function clearOffsets(definition is map) returns map
{
    const lines = size(definition.lines);
    for (var i = 0; i < lines; i += 1)
        definition.lines[i].offsetVertex = undefined;
    return definition;
}

function clearHighlights(definition is map) returns map
{
    const lines = size(definition.lines);
    for (var i = 0; i < lines; i += 1)
        definition.lines[i].highlight = undefined;
    return definition;
}

function segmentLength(context is Context, point is Vector, line is map) returns ValueWithUnits
{
    var direction = DIRECTION_VECTOR[line.direction];
    var length = line.length;
    var offsetVertex = try silent(evVertexPoint(context, {"vertex" : line.offsetVertex }));
    if (offsetVertex == undefined)
    {
        offsetVertex = try silent(evCurveDefinition(context, { "edge" : line.offsetVertex }).coordSystem.origin);
    }
    if (offsetVertex != undefined)
        length += dot(offsetVertex - point, direction);
    return length;
}

annotation { "Feature Type Name" : "Pipe" }
export const pipe = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Inner radius" }
        isLength(definition.innerRadius, SHELL_OFFSET_BOUNDS);

        annotation { "Name" : "Outer radius" }
        isLength(definition.outerRadius, BLEND_BOUNDS);

        annotation { "Name" : "Round cross-section" }
        definition.circle is boolean;


        annotation { "Name" : "Path to follow" }
        definition.skeleton is FeatureList;
    }
    {
        var edges = [];
        for (var feature in definition.skeleton)
            edges = append(edges, qCreatedBy(feature.key, EntityType.EDGE));
        edges = qUnion(edges);
        var path = constructPath(context, edges);
        var startLine = evPathTangentLines(context, path, [0]).tangentLines[0];

        var sketch = newSketchOnPlane(context, id + "sketch1", { "sketchPlane" : plane(startLine.origin, startLine.direction) });
        if (definition.circle)
        {
            skCircle(sketch, "circle1", { "center" : vector(0, 0) * inch, "radius" : definition.innerRadius });
            skCircle(sketch, "circle2", { "center" : vector(0, 0) * inch, "radius" : definition.outerRadius });
        }
        else
        {
            var r = definition.innerRadius;
            skRectangle(sketch, "rectangle1", { "firstCorner" : vector(-r, -r), "secondCorner" : vector(r, r) });
            r = definition.outerRadius;
            skRectangle(sketch, "rectangle2", { "firstCorner" : vector(-r, -r), "secondCorner" : vector(r, r) });
        }
        skSolve(sketch);
        opSweep(context, id + "sweep1", {
                "profiles" : qFarthestAlong(qCreatedBy(id + "sketch1", EntityType.FACE), perpendicularVector(startLine.direction)),
                "path" : edges
        });
        opDeleteBodies(context, id + "deleteBodies1", {
                "entities" : qCreatedBy(id + "sketch1", EntityType.BODY)
        });
    });
