// https://cad.onshape.com/documents/0bb13c1b6ed6d4a6dd75cf99/w/b4493d47a45c27ce485c84b9/e/6964afb5cc9d8d73597942d5

FeatureScript 1576;
import(path : "onshape/std/geometry.fs", version : "1576.0");
import(path : "1ec63e5aed89d809a384210e", version : "e92cece01d6ab457707afc49");

export enum ProjectionType
{
    annotation { "Name" : "Closest" }
    CLOSEST,
    annotation { "Name" : "Along direction" }
    ALONG_DIR,
    annotation { "Name" : "Through axis" }
    AXIS,
    annotation { "Name" : "Through vertex" }
    VERTEX,
    annotation { "Name" : "Through entity" }
    ARBITARY
}

annotation { "Feature Type Name" : "Project" }
export const opProjectEntities = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Edges, faces or wires to project", "Filter" : EntityType.EDGE && ConstructionObject.NO || EntityType.FACE || EntityType.BODY && BodyType.WIRE }
        definition.sourceEntities is Query;

        annotation { "Name" : "Target face or body", "Filter" : EntityType.FACE || EntityType.BODY && (BodyType.SOLID || BodyType.SHEET) }
        definition.targetEntity is Query;

        annotation { "Name" : "Projection type", "UIHint" : UIHint.SHOW_LABEL }
        definition.projectionType is ProjectionType;

        if (definition.projectionType == ProjectionType.CLOSEST)
        {
            annotation { "Name" : "Allow extention" }
            definition.allowExt is boolean;
        }
        else if (definition.projectionType == ProjectionType.ALONG_DIR)
        {
            annotation { "Name" : "Reference direction", "Filter" : QueryFilterCompound.ALLOWS_DIRECTION, "MaxNumberOfPicks" : 1 }
            definition.refDirection is Query;
        }
        else if (definition.projectionType == ProjectionType.AXIS)
        {
            annotation { "Name" : "Reference axis", "Filter" : QueryFilterCompound.ALLOWS_AXIS, "MaxNumberOfPicks" : 1 }
            definition.refAxis is Query;
        }
        else if (definition.projectionType == ProjectionType.VERTEX)
        {
            annotation { "Name" : "Reference vertex", "Filter" : QueryFilterCompound.ALLOWS_VERTEX, "MaxNumberOfPicks" : 1 }
            definition.refVertex is Query;
        }
        else if (definition.projectionType == ProjectionType.ARBITARY)
        {
            annotation { "Name" : "Reference entity", "Filter" : EntityType.VERTEX || EntityType.EDGE && SketchObject.YES && ConstructionObject.NO || EntityType.FACE || EntityType.BODY }
            definition.refEntity is Query;
        }

        if (definition.projectionType != ProjectionType.CLOSEST)
            annotation { "Name" : "Flip direction", "UIHint" : UIHint.OPPOSITE_DIRECTION }
            definition.flipDir is boolean;

        annotation { "Name" : "Use path" }
        definition.usePath is boolean;

        annotation { "Group Name" : "Advanced", "Collapsed By Default" : true }
        {
            if (definition.usePath)
                annotation { "Name" : "Path tolerance" }
                isLength(definition.tolerance, { (millimeter) : [10e-6, 10e-2, 10e3] } as LengthBoundSpec);

            annotation { "Name" : "Length step" }
            isLength(definition.lengthStep, { (millimeter) : [0.1, 0.5, 1000] } as LengthBoundSpec);

            annotation { "Name" : "Use derivatives", "Default" : true }
            definition.useDerivatives is boolean;
        }
    }
    {
        const sourceEdges = qUnion([
                    //Wire edges
                    qBodyType(definition.sourceEntities, BodyType.WIRE)->qOwnedByBody(EntityType.EDGE),
                    //Face loop edges
                    qEntityFilter(definition.sourceEntities, EntityType.FACE)->qLoopEdges(),
                    //Individual edges
                    qEntityFilter(definition.sourceEntities, EntityType.EDGE)
                ]);

        var pointTr3d;
        if (definition.projectionType == ProjectionType.CLOSEST)
        {
            pointTr3d = function(arg)
                {
                    return projectToClosest(context, arg.point, definition);
                };
        }
        else if (definition.projectionType == ProjectionType.ALONG_DIR)
        {
            definition.refDirection = extractDirection(context, definition.refDirection);

            pointTr3d = function(arg)
                {
                    return projectAlongDir(context, arg.point, definition);
                };
        }
        else if (definition.projectionType == ProjectionType.AXIS)
        {
            definition.refAxis = evAxis(context, { "axis" : definition.refAxis });

            pointTr3d = function(arg)
                {
                    return projectThroughAxis(context, arg.point, definition);
                };
        }
        else if (definition.projectionType == ProjectionType.VERTEX)
        {
            definition.refVertex = evVertexPoint(context, { "vertex" : definition.refVertex });

            pointTr3d = function(arg)
                {
                    return projectThroughVertex(context, arg.point, definition);
                };
        }
        else if (definition.projectionType == ProjectionType.ARBITARY)
        {
            pointTr3d = function(arg)
                {
                    return projectThroughEntity(context, arg.point, definition);
                };
        }

        if (definition.usePath)
        {
            opTransformPath3d(context, id + "trPath", {
                        "curveQuery" : sourceEdges,
                        "transformFunction" : pointTr3d,
                        "lengthStep" : definition.lengthStep,
                        "tolerance" : definition.tolerance,
                        "derivatives" : definition.useDerivatives
                    });
        }
        else
        {
            opTransformCurve3d(context, id + "trEdges", {
                        "edges" : sourceEdges,
                        "transformFunction" : pointTr3d,
                        "lengthStep" : definition.lengthStep,
                        "derivatives" : definition.useDerivatives
                    });
        }
    });

function projectToClosest(context is Context, point is Vector, definition is map) returns Vector
{
    const projectResult = evDistance(context, {
                "side0" : definition.targetEntity,
                "extendSide0" : definition.allowExt,
                "side1" : point
            });

    return projectResult.sides[0]["point"];
}

function projectAlongDir(context is Context, point is Vector, definition is map) returns Vector
{
    if (definition.flipDir)
        definition.refDirection *= -1;

    point += definition.refDirection * 10e-3 * millimeter;

    const projectResult = evRaycast(context, {
                "entities" : definition.targetEntity,
                "ray" : line(point, definition.refDirection),
                "closest" : true
            });

    return projectResult[0].intersection;
}

function projectThroughAxis(context is Context, point is Vector, definition is map) returns Vector
{
    definition.refDirection = normalize(point - project(definition.refAxis, point));
    return projectAlongDir(context, point, definition);
}

function projectThroughVertex(context is Context, point is Vector, definition is map) returns Vector
{
    definition.refDirection = normalize(definition.refVertex - point);
    return projectAlongDir(context, point, definition);
}

function projectThroughEntity(context is Context, point is Vector, definition is map) returns Vector
{
    var refVertex = evDistance(context, {
                "side0" : definition.refEntity,
                "extendSide0" : definition.allowExt,
                "side1" : point
            }).sides[0]["point"];

    definition.refDirection = normalize(refVertex - point);
    return projectAlongDir(context, point, definition);
}
