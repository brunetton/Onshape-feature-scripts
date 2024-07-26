// https://cad.onshape.com/documents/5738c1f6e4b06c68b35e66aa/w/8020013d82bd47f4c504106c/e/18be14589a1396e62b7b06e2

/*
    Snap Hook

    This custom feature creates a common fastening feature in plastic part design.

    The Snap Hook is just one version of this type of fastening feature
    and could be easily extended to include many other types. This was built
    to show that you can create complex, compound features easily.

    Version 1 - April 26, 2016 - Neil Cooke, Onshape Inc.
*/

FeatureScript 336;
import(path : "onshape/std/geometry.fs", version : "336.0");
icon::import(path : "2d40cd469e792c44b41b2ea3", version : "65670d02ced02c13716fe152");

annotation { "Feature Type Name" : "Snap Hook", "Icon" : icon::BLOB_DATA, "Feature Type Description" : "Snap hook for fastening plastic parts." }
export const SnapHook = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Sketch point locations", "Filter" : EntityType.VERTEX && SketchObject.YES && ConstructionObject.NO }
        definition.locations is Query;

        annotation { "Name" : "Height type" }
        definition.style is HookStyle;

        if (definition.style == HookStyle.BLIND)
        {
            annotation { "Name" : "Height", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
            isLength(definition.height, HOOK_HEIGHT);
        }
        else
        {
            annotation { "Name" : "Parallel face or plane", "Filter" : EntityType.FACE, "MaxNumberOfPicks" : 1 }
            definition.parallelFace is Query;
        }

        annotation { "Name" : "Width", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.hookWidth, HOOK_WIDTH);

        annotation { "Name" : "Flip direction", "UIHint" : "OPPOSITE_DIRECTION" }
        definition.hookFlipDirection is boolean;

        annotation { "Name" : "Edge to define direction", "Filter" : EntityType.EDGE, "MaxNumberOfPicks" : 1 }
        definition.hookDirection is Query;

        annotation { "Name" : "Thickness", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.hookThickness, HOOK_THK);

        annotation { "Name" : "Undercut depth", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.hookDepth, HOOK_THK);

        annotation { "Name" : "Lip height", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.flatHeight, HOOK_LIP);

        annotation { "Name" : "Insertion angle", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isAngle(definition.deflectionAngle, HOOK_ANGLE);

        annotation { "Name" : "Draft", "UIHint" : ["DISPLAY_SHORT", "REMEMBER_PREVIOUS_VALUE"], "Default" : true }
        definition.hasDraft is boolean;

        if (definition.hasDraft == true)
        {
            annotation { "Name" : "Draft angle", "UIHint" : ["DISPLAY_SHORT", "REMEMBER_PREVIOUS_VALUE"] }
            isAngle(definition.draftAngle, ANGLE_STRICT_90_BOUNDS);

            annotation { "Name" : "Back face draft angle", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
            isAngle(definition.backDraftAngle, ANGLE_STRICT_90_BOUNDS);
        }
        annotation { "Name" : "Cutout", "Default" : true }
        definition.hasCutout is boolean;

        annotation { "Name" : "Merge scope", "Filter" : EntityType.BODY && BodyType.SOLID }
        definition.booleanScope is Query;
    }

    {
        // get all the user selected locations
        const locations = evaluateQuery(context, definition.locations);

        // if a solid body intersects the first point in the list, automatically use that in the merge scope
        const targetBody = evaluateQuery(context, qContainsPoint(qBodyType(qEverything(EntityType.BODY), BodyType.SOLID), evVertexPoint(context, { "vertex" : locations[0] })));

        if (size(targetBody) == 0 && definition.booleanScope != undefined)
            definition.targetBody = definition.booleanScope; // if not, get user to select merge scope
        else
            definition.targetBody = targetBody[0];

        var sketchPlane is Plane = evOwnerSketchPlane(context, { "entity" : locations[0] });
        var topPlane;

        var hookVector = vector(1, 0); // by default pointing across in x

        // if user has defined hook direction, work out the vector
        if (definition.hookDirection != undefined)
        {
            const directionResult = try(evAxis(context, { "axis" : definition.hookDirection }));

            if (directionResult != undefined)
                hookVector = normalize(vector(directionResult.direction[0], directionResult.direction[1]));
        }

        if (definition.hookFlipDirection)
            hookVector = hookVector * -1;

        // get vector perpendicular to hook direction
        var perpHookVector = vector(hookVector[1] * -1, hookVector[0]);

        // define the plane for the top of the boss
        if (definition.style == HookStyle.PLANE && definition.parallelFace != undefined)
            topPlane = evPlane(context, { "face" : definition.parallelFace });
        else
            topPlane = plane(sketchPlane.origin + definition.height * sketchPlane.normal, sketchPlane.normal);

        var nameId = 1;
        var chamferPoints = [];
        var frontFacePoints = [];
        var backFacePoints = [];

        const sketch1 = newSketchOnPlane(context, id + "sketch1", { "sketchPlane" : topPlane });
        const sketch2 = newSketchOnPlane(context, id + "sketch2", { "sketchPlane" : topPlane });
        const sketch3 = newSketchOnPlane(context, id + "sketch3", { "sketchPlane" : topPlane });

        definition.depth = definition.hookDepth / tan(definition.deflectionAngle) + definition.flatHeight;

        // Build 3 sketches each with a rectangle
        for (var location in locations)
        {
            var point is Vector = worldToPlane(topPlane, evVertexPoint(context, { "vertex" : location }));

            skRectangle(sketch1, "rectangleHook" ~ nameId, {
                        "firstCorner" : vector(point[0], point[1]) + (definition.hookWidth / 2) * hookVector,
                        "secondCorner" : vector(point[0], point[1]) - (definition.hookWidth / 2) * hookVector - definition.hookDepth * perpHookVector
                    });

            skRectangle(sketch2, "rectangleThickness" ~ nameId, {
                        "firstCorner" : vector(point[0], point[1]) - (definition.hookWidth / 2) * hookVector,
                        "secondCorner" : vector(point[0], point[1]) + (definition.hookWidth / 2) * hookVector + definition.hookThickness * perpHookVector
                    });

            skRectangle(sketch3, "completeRectangle" ~ nameId, {
                        "firstCorner" : vector(point[0], point[1]) - (definition.hookWidth / 2) * hookVector - definition.hookDepth * perpHookVector,
                        "secondCorner" : vector(point[0], point[1]) + (definition.hookWidth / 2) * hookVector + definition.hookThickness * perpHookVector
                    });

            // Keep a list of the centerpoints of the edges where the chamfers may go
            var chamferPoint2d = vector(point[0], point[1]) - definition.hookDepth * perpHookVector;
            if (definition.hasDraft)
            {
                chamferPoint2d = vector(point[0], point[1]) - (definition.hookDepth - definition.depth * tan(definition.draftAngle)) * perpHookVector;
            }
            chamferPoints = append(chamferPoints, toWorld(planeToCSys(topPlane), vector(chamferPoint2d[0], chamferPoint2d[1], definition.depth)));

            var backFacePoint2d = vector(point[0], point[1]) + definition.hookThickness * perpHookVector;
            backFacePoints = append(backFacePoints, toWorld(planeToCSys(topPlane), vector(backFacePoint2d[0], backFacePoint2d[1], 0 * meter)));
            frontFacePoints = append(frontFacePoints, toWorld(planeToCSys(topPlane), vector(point[0], point[1], 0 * meter)));

            nameId += 1;
        }
        skSolve(sketch1);
        skSolve(sketch2);
        skSolve(sketch3);

        extrude(context, id + ("extrude1"), {
                    "entities" : qSketchRegion(id + "sketch2"),
                    "endBound" : BoundingType.UP_TO_BODY,
                    "depth" : definition.depth,
                    "endBoundEntityBody" : definition.targetBody,
                    "oppositeDirection" : true,
                    "hasDraft" : definition.hasDraft,
                    "draftAngle" : definition.draftAngle,
                    "draftPullDirection" : false,
                    "operationType" : NewBodyOperationType.ADD,
                    "defaultScope" : false,
                    "booleanScope" : definition.targetBody
                });

        extrude(context, id + ("extrude2"), {
                    "entities" : qSketchRegion(id + "sketch3"),
                    "endBound" : BoundingType.BLIND,
                    "depth" : definition.depth,
                    "endBoundEntityBody" : definition.targetBody,
                    "oppositeDirection" : false,
                    "hasDraft" : definition.hasDraft,
                    "draftAngle" : definition.draftAngle,
                    "draftPullDirection" : true,
                    "operationType" : NewBodyOperationType.ADD,
                    "defaultScope" : false,
                    "booleanScope" : definition.targetBody
                });

        var chamferEdges = [];

        for (var i = 0; i < size(chamferPoints); i += 1)
        {
            // Find the edges that intersect the points previously collected
            chamferEdges = append(chamferEdges, qContainsPoint(qCreatedBy(id + "extrude2", EntityType.EDGE), chamferPoints[i]));
        }

        try(opChamfer(context, id + "chamfer1", {
                        "entities" : qUnion(chamferEdges),
                        "chamferType" : ChamferType.OFFSET_ANGLE,
                        "width" : definition.depth - definition.flatHeight,
                        "angle" : definition.deflectionAngle,
                        "oppositeDirection" : true
                    }));

        if (definition.hasDraft)
        {
            var backFaces = [];
            var frontFaces = [];

            for (var i = 0; i < size(backFacePoints); i += 1)
            {
                // Find the edges that intersect the points previously collected
                backFaces = append(backFaces, qContainsPoint(qCreatedBy(id + "extrude1", EntityType.FACE), backFacePoints[i]));
                frontFaces = append(frontFaces, qContainsPoint(qCreatedBy(id + "extrude1", EntityType.FACE), frontFacePoints[i]));
            }

            opPlane(context, id + "plane1", {
                        "plane" : topPlane,
                        "size" : 0.1 * meter
                    });

            opDraft(context, id + "draft1", {
                        "neutralPlane" : qCreatedBy(id + "plane1", EntityType.FACE),
                        "pullVec" : topPlane.normal,
                        "draftFaces" : qUnion(frontFaces),
                        "angle" : 0 * degree
                    });

            opDraft(context, id + "draft2", {
                        "neutralPlane" : qCreatedBy(id + "plane1", EntityType.FACE),
                        "pullVec" : topPlane.normal,
                        "draftFaces" : qUnion(backFaces),
                        "angle" : definition.backDraftAngle + definition.draftAngle
                    });
        }

        if (definition.hasCutout)
        {
            extrude(context, id + ("extrude3"), {
                        "entities" : qSketchRegion(id + "sketch1"),
                        "endBound" : BoundingType.THROUGH_ALL,
                        "depth" : definition.depth,
                        "endBoundEntityBody" : definition.targetBody,
                        "oppositeDirection" : true,
                        "hasDraft" : definition.hasDraft,
                        "draftAngle" : definition.draftAngle,
                        "draftPullDirection" : false,
                        "operationType" : NewBodyOperationType.REMOVE,
                        "defaultScope" : false,
                        "booleanScope" : definition.targetBody
                    });
        }

        // Remove sketch entities and plane - no longer required
        var sketches = [qCreatedBy(id + "sketch1"), qCreatedBy(id + "sketch2"), qCreatedBy(id + "sketch3"), qCreatedBy(id + "plane1")];
        opDeleteBodies(context, id + "delete", { "entities" : qUnion(sketches) });

    }, {});

const HOOK_ANGLE =
{
            "min" : -TOLERANCE.zeroAngle * radian,
            "max" : (2 * PI + TOLERANCE.zeroAngle) * radian,
            (degree) : [15, 30, 60]
        } as AngleBoundSpec;

const HOOK_HEIGHT =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [1e-5, 0.015, 500],
            (centimeter) : 1.5,
            (millimeter) : 15.0,
            (inch) : 0.6
        } as LengthBoundSpec;

const HOOK_WIDTH =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [1e-5, 0.005, 500],
            (centimeter) : 0.5,
            (millimeter) : 5.0,
            (inch) : 0.2
        } as LengthBoundSpec;

const HOOK_THK =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [1e-5, 0.002, 500],
            (centimeter) : 0.2,
            (millimeter) : 2.0,
            (inch) : 0.08
        } as LengthBoundSpec;

const HOOK_LIP =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [1e-5, 0.001, 500],
            (centimeter) : 0.1,
            (millimeter) : 1.0,
            (inch) : 0.04
        } as LengthBoundSpec;

export enum HookStyle
{
    annotation { "Name" : "Blind" }
    BLIND,
    annotation { "Name" : "Up to face" }
    PLANE
}


