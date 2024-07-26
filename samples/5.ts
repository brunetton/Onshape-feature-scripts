// https://cad.onshape.com/documents/723f38c9725c6634d3ecef92/w/d41387ed1184180677473ae8/e/fa2582368e3b336ec44ced68

FeatureScript 799;
import(path : "onshape/std/geometry.fs", version : "799.0");

export enum SingleOrMultipleJoints
{
    annotation { "Name" : "Single" }
    SINGLE,
    annotation { "Name" : "Multiple" }
    MULTIPLE
}

annotation { "Feature Type Name" : "Rabbet Joint", "Editing Logic Function" : "rabbetJointEditLogic" }
export const rabbetJoint = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Joint Type Selection", "UIHint" : "HORIZONTAL_ENUM" }
        definition.singleOrMultipleJoint is SingleOrMultipleJoints;

        if (definition.singleOrMultipleJoint == SingleOrMultipleJoints.SINGLE)
        {
            annotation { "Name" : "Faces", "Filter" : EntityType.FACE && BodyType.SOLID && GeometryType.PLANE && ModifiableEntityOnly.YES, "MaxNumberOfPicks" : 2 }
            definition.faceOne is Query;

            annotation { "Name" : "Face two", "Filter" : EntityType.FACE, "UIHint" : "ALWAYS_HIDDEN" }
            definition.faceTwo is Query;

            annotation { "Name" : "Opposite Direction", "UIHint" : "OPPOSITE_DIRECTION" }
            definition.oppositeDirection is boolean;
        }
        else
        {
            annotation { "Name" : "Joints", "Item name" : "Joint", "Item label template" : "Joint" }
            definition.joints is array;
            for (var joint in definition.joints)
            {
                annotation { "Name" : "Faces", "Filter" : EntityType.FACE && BodyType.SOLID && GeometryType.PLANE && ModifiableEntityOnly.YES, "MaxNumberOfPicks" : 2 }
                joint.faces is Query;

                annotation { "Name" : "Opposite Direction", "UIHint" : "OPPOSITE_DIRECTION" }
                joint.isOppositeDirection is boolean;
            }
        }
    }
    {
        var faceArray = (definition.singleOrMultipleJoint == SingleOrMultipleJoints.SINGLE ?
            [{
                        "faces" : definition.faceOne,
                        "isOppositeDirection" : definition.oppositeDirection
                    }] :
            definition.joints);
        for (var i = 0; i < size(faceArray); i += 1)
        {
            var jointDefinition = faceArray[i];
            var faces = jointDefinition.faces;
            if (size(evaluateQuery(context, faces)) > 0)
            {
                // Check that there is two faces
                if (size(evaluateQuery(context, faces)) != 2)
                {
                    throw regenError("Two faces need to be selected", ["faceOne"], faces);
                }
                if (size(evaluateQuery(context, qOwnerBody(faces))) < 2)
                {
                    throw regenError("Faces need to be from separate parts", ["faceOne"], faces);
                }
                jointDefinition.faceOne = qNthElement(faces, jointDefinition.isOppositeDirection ? 1 : 0);
                jointDefinition.faceTwo = qNthElement(faces, jointDefinition.isOppositeDirection ? 0 : 1);
                var faceOneEdges = qEdgeAdjacent(jointDefinition.faceOne, EntityType.EDGE);
                var faceTwoEdges = qEdgeAdjacent(jointDefinition.faceTwo, EntityType.EDGE);
                var faceOneNormal = evPlane(context, { "face" : jointDefinition.faceOne }).normal;
                var faceTwoNormal = evPlane(context, { "face" : jointDefinition.faceTwo }).normal;
                // Check that the faces are four-sided
                if (size(evaluateQuery(context, faceOneEdges)) != 4 || size(evaluateQuery(context, faceTwoEdges)) != 4)
                {
                    if (size(evaluateQuery(context, faceTwoEdges)) == 4)
                        throw regenError("Faces must have 4 edges.", ["faceOne"], jointDefinition.faceOne);
                    else
                        throw regenError("Faces must have 4 edges.", ["faceOne"], jointDefinition.faceTwo);
                }
                var faceWidth = evLength(context, {
                            "entities" : faceOneEdges
                        }) / 4;
                // Move faces to starting position
                {
                    moveFace(context, id + i + "moveFace0", {
                                "moveFaces" : jointDefinition.faceTwo,
                                "moveFaceType" : MoveFaceType.OFFSET,
                                "limitType" : MoveFaceBoundingType.UP_TO_ENTITY,
                                "limitQuery" :
                                    qFarthestAlong(
                                        qVertexAdjacent(
                                            qEdgeAdjacent(
                                                jointDefinition.faceOne,
                                                EntityType.EDGE
                                            ),
                                            EntityType.VERTEX
                                        ),
                                        -faceTwoNormal
                                    )
                            });
                    moveFace(context, id + i + "moveFace1", {
                                "moveFaces" : jointDefinition.faceOne,
                                "moveFaceType" : MoveFaceType.OFFSET,
                                "limitType" : MoveFaceBoundingType.UP_TO_ENTITY,
                                "limitQuery" :
                                    qFarthestAlong(
                                        qVertexAdjacent(
                                            qEdgeAdjacent(
                                                jointDefinition.faceTwo,
                                                EntityType.EDGE
                                            ),
                                            EntityType.VERTEX
                                        ),
                                        faceOneNormal
                                    )
                            });
                }
                // Move the face into the other part
                moveFace(context, id + i + "moveFace2", {
                            "moveFaces" : jointDefinition.faceTwo,
                            "moveFaceType" : MoveFaceType.OFFSET,
                            "limitType" : MoveFaceBoundingType.UP_TO_ENTITY,
                            "limitQuery" :
                                qFarthestAlong(
                                    qVertexAdjacent(
                                        qEdgeAdjacent(
                                            jointDefinition.faceOne,
                                            EntityType.EDGE
                                        ),
                                        EntityType.VERTEX
                                    ),
                                    faceTwoNormal
                                ),
                            "hasOffset" : true,
                            "offset" : faceWidth / 2,
                            "oppositeOffsetDirection" : true
                        });
                // Cut the joint
                opBoolean(context, id + i + "boolean", {
                            "tools" : qOwnerBody(jointDefinition.faceTwo),
                            "targets" : qOwnerBody(jointDefinition.faceOne),
                            "operationType" : BooleanOperationType.SUBTRACTION,
                            "keepTools" : true
                        });
                // Neaten up face one
                moveFace(context, id + i + "moveFace3", {
                            "moveFaces" : jointDefinition.faceOne,
                            "moveFaceType" : MoveFaceType.OFFSET,
                            "limitType" : MoveFaceBoundingType.UP_TO_ENTITY,
                            "limitQuery" :
                                qFarthestAlong(
                                    qVertexAdjacent(
                                        qEdgeAdjacent(
                                            jointDefinition.faceTwo,
                                            EntityType.EDGE
                                        ),
                                        EntityType.VERTEX
                                    ),
                                    faceOneNormal
                                )
                        });
            }
        }
    });

export function rabbetJointEditLogic(context is Context, id is Id, oldDefinition is map, definition is map,
    isCreating is boolean, specifiedParameters is map, hiddenBodies is Query) returns map
{
    // This is a fix for earlier versions of the feature
    if (!isCreating && definition.singleOrMultipleJoint == SingleOrMultipleJoints.SINGLE)
        definition.faceOne = qUnion([definition.faceOne, definition.faceTwo]);
    return definition;
}
