// https://cad.onshape.com/documents/578ce95de4b0e425c1f00cda/w/cbc0b1ab48f411a4675afae1/e/d1b735dfb5cbfcfb7ba88b9e

FeatureScript 355;
import(path : "onshape/std/geometry.fs", version : "355.0");
icon::import(path : "c61adf049731998ab3be3355", version : "c9f08c8779410d6eaf272c24");

annotation { "Feature Type Name" : "Lap Joint", "Filter Selector" : "fs", "Icon" : icon::BLOB_DATA }
export const LapJoint = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Select intersecting bodies", "Filter" : EntityType.BODY, "MaxNumberOfPicks" : 2 }
        definition.bodies is Query;

        annotation { "Name" : "Parallel reference face" }
        definition.pickFace is boolean;

        if (definition.pickFace)
        {
            annotation { "Name" : "Parallel reference face", "Filter" : EntityType.FACE, "MaxNumberOfPicks" : 1 }
            definition.topFace is Query;

            annotation { "Name" : "Full cut" }
            definition.fullCut is boolean;

            if (definition.fullCut)
            {
                annotation { "Name" : "Extend cut" }
                definition.extend is boolean;

                annotation { "Name" : "Extend cut", "UIHint" : "OPPOSITE_DIRECTION" }
                definition.extendDir is boolean;
            }
        }

        annotation { "Name" : "Cut opposite side" }
        definition.flip is boolean;
    }
    {
        const bodies = evaluateQuery(context, definition.bodies);

        if (size(bodies) != 2)
        {
            throw regenError("Operation requires two intersecting bodies", ["bodies"]);
        }

        opBoolean(context, id + "booleanIntersection", {
                    "tools" : definition.bodies,
                    "operationType" : BooleanOperationType.INTERSECTION,
                    "keepTools" : true
                });

        const intersectionFaces = evaluateQuery(context, qCreatedBy(id + "booleanIntersection", EntityType.FACE));

        if (size(intersectionFaces) == 0)
        {
            throw regenError("Operation requires two intersecting bodies", ["bodies"]);
        }

        var outerPlanes = [];
        var planeIndex = [0, 1];

        for (var face in intersectionFaces)
        {
            try
            {
                // if the face is not planar, ignore
                var facePlane = evPlane(context, { "face" : face });

                // if the center of the face is coicident with faces on both bodies then it's an external face
                if (evaluateQuery(context, qContainsPoint(qOwnedByBody(qNthElement(definition.bodies, 0), EntityType.FACE), facePlane.origin)) != [] &&
                    evaluateQuery(context, qContainsPoint(qOwnedByBody(qNthElement(definition.bodies, 1), EntityType.FACE), facePlane.origin)) != [])
                {
                    outerPlanes = append(outerPlanes, facePlane);
                }
            }
        }

        if (size(outerPlanes) < 2)
        {
            if (evaluateQuery(context, definition.topFace) == [])
            {
                throw regenError("Parallel reference face required", ["topFace"]);
            }

            const topPlane = evPlane(context, { "face" : definition.topFace });

            outerPlanes = [];

            for (var i = 0; i < size(intersectionFaces); i += 1)
            {
                if (intersection(evFaceTangentPlane(context, { "face" : intersectionFaces[i], "parameter" : vector(0.5, 0.5) }), topPlane) == undefined)
                {
                    outerPlanes = append(outerPlanes, evPlane(context, { "face" : intersectionFaces[i] }));
                }
            }
        }

        if (size(outerPlanes) > 2) // Special cases 'T' junction, corner, and parallel
        {
            var topPlane;

            if (evaluateQuery(context, definition.topFace) != [])
            {
                topPlane = evPlane(context, { "face" : definition.topFace });
            }

            for (var i = 0; i < size(outerPlanes); i += 1)
            {
                for (var j = 0; j < i; j += 1)
                {
                    if (topPlane == undefined)
                    {
                        if (intersection(outerPlanes[i], outerPlanes[j]) == undefined)
                        {
                            planeIndex = [i, j];
                        }
                    }
                    else
                    {
                        if (intersection(outerPlanes[i], outerPlanes[j]) == undefined && intersection(outerPlanes[i], topPlane) == undefined)
                        {
                            planeIndex = [i, j];
                        }
                    }
                }
            }
        }

        // Get midplane between outer faces
        const midPoint = 0.5 * (outerPlanes[planeIndex[0]].origin + outerPlanes[planeIndex[1]].origin);
        const normal = normalize(outerPlanes[planeIndex[0]].normal + outerPlanes[planeIndex[1]].normal * -1);

        opPlane(context, id + "midPlane", { "plane" : plane(midPoint, normal) });

        opSplitPart(context, id + "splitBooleanIntersection", {
                    "targets" : qCreatedBy(id + "booleanIntersection", EntityType.BODY),
                    "tool" : qCreatedBy(id + "midPlane", EntityType.BODY)
                });

        const extrudeFace = qNthElement(qCreatedBy(id + "splitBooleanIntersection", EntityType.FACE), 0);

        var cutData = [0, 0, 1, 1];
        var flip = definition.flip ? 1 : -1;

        if (definition.fullCut)
        {
            cutData = [1, 0, 1, 0];
            if (definition.extend)
                cutData = [0, 0, 1, 0];
            if (definition.flip)
            {
                cutData = [0, 1, 0, 1];
                if (definition.extend)
                    cutData = [1, 1, 0, 1];
            }
        }

        if (definition.extendDir)
            flip *= -1;

        opExtrude(context, id + "extrude1", {
                    "entities" : extrudeFace,
                    "direction" : normal * flip,
                    "endBound" : BoundingType.UP_TO_BODY,
                    "endBoundEntity" : qNthElement(definition.bodies, cutData[0])
                });

        opBoolean(context, id + "boolean1", {
                    "tools" : qCreatedBy(id + "extrude1", EntityType.BODY),
                    "targets" : qNthElement(definition.bodies, cutData[1]),
                    "operationType" : BooleanOperationType.SUBTRACTION
                });

        opExtrude(context, id + "extrude2", {
                    "entities" : extrudeFace,
                    "direction" : normal * flip * -1,
                    "endBound" : BoundingType.UP_TO_BODY,
                    "endBoundEntity" : qNthElement(definition.bodies, cutData[2])
                });

        opBoolean(context, id + "boolean2", {
                    "tools" : qCreatedBy(id + "extrude2", EntityType.BODY),
                    "targets" : qNthElement(definition.bodies, cutData[3]),
                    "operationType" : BooleanOperationType.SUBTRACTION
                });

        opDeleteBodies(context, id + "deleteBodies1", {
                    "entities" : qUnion([qCreatedBy(id + "splitBooleanIntersection"), qCreatedBy(id + "midPlane")])
                });
    });

