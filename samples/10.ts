// https://cad.onshape.com/documents/57612867e4b018f59e4d52ce/w/1e657f13b93a753115dcbd12/e/d2a8493c9958411c44690fcf

FeatureScript 347;
import(path : "onshape/std/geometry.fs", version : "347.0");
icon::import(path : "fef5f5ddfcb1594d27c9999c", version : "471f3b95af4330656b9b1ad3");

annotation { "Feature Type Name" : "Box Joint", "Editing Logic Function" : "jointLogic", "Filter Selector" : "fs", "Icon" : icon::BLOB_DATA }
export const BoxJoint = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Select parts to join", "Filter" : EntityType.BODY, "MaxNumberOfPicks" : 2 }
        definition.bodies is Query;

        annotation { "Name" : "Define pin direction", "UIHint" : "ALWAYS_HIDDEN" }
        definition.pinPlane is boolean;

        if (definition.pinPlane)
        {
            annotation { "Name" : "Parallel pin face (optional)", "Filter" : GeometryType.PLANE, "MaxNumberOfPicks" : 1 }
            definition.pinFace is Query;
        }

        annotation { "Name" : "Number of pins" }
        isInteger(definition.numPins, PIN_BOUNDS);

        annotation { "Name" : "Pin side", "UIHint" : "OPPOSITE_DIRECTION" }
        definition.pinSide is boolean;

        annotation { "Name" : "Dovetail" }
        definition.dovetail is boolean;

        if (definition.dovetail)
        {
            annotation { "Name" : "Tail side", "UIHint" : "OPPOSITE_DIRECTION" }
            definition.tailSide is boolean;

            annotation { "Name" : "Angle" }
            isAngle(definition.dovetailAngle, DOVETAIL_BOUNDS);
        }

        annotation { "Name" : "Offset" }
        definition.edgeOffset is boolean;

        if (definition.edgeOffset)
        {
            annotation { "Name" : "Start offset" }
            isLength(definition.startOffset, ZERO_DEFAULT_LENGTH_BOUNDS);

            annotation { "Name" : "End offset" }
            isLength(definition.endOffset, ZERO_DEFAULT_LENGTH_BOUNDS);
        }
    }

    {
        const panelBodies = evaluateQuery(context, definition.bodies);

        if (size(panelBodies) != 2)
        {
            throw regenError("Operation requires two intersecting parts", ["bodies"]);
        }

        opBoolean(context, id + ("pin0"), {
                    "tools" : definition.bodies,
                    "operationType" : BooleanOperationType.INTERSECTION,
                    "keepTools" : true
                });

        // find all faces belonging to resultant body
        var bodyFaces = evaluateQuery(context, qCreatedBy(id + "pin0", EntityType.FACE));

        if (size(bodyFaces) == 0)
        {
            throw regenError("Operation requires two intersecting parts", ["bodies"]);
        }

        var faceInfo = getFaceInfo(context, id, bodyFaces, panelBodies, definition.tailSide);

        var neutralPlane = faceInfo.neutralPlane;

        if (faceInfo.intersection != undefined) // if end faces are not parallel, find midplane and set pin faces parallel to that instead
        {
            var midPlane;

            if (size(evaluateQuery(context, definition.pinFace)) > 0)
            {
                midPlane = evPlane(context, {
                        "face" : definition.pinFace
                        });
            }
            else
            {
                const midPoint = 0.5 * (faceInfo.planes[faceInfo.side0].origin + faceInfo.planes[faceInfo.side1].origin);
                const normal = normalize(faceInfo.planes[faceInfo.side0].normal + faceInfo.planes[faceInfo.side1].normal * -1);
                const x = rotationMatrix3d(faceInfo.planes[faceInfo.side0].normal, normal) * faceInfo.planes[faceInfo.side0].x;
                midPlane = plane(midPoint, normal, x);
            }

            midPlane.origin = faceInfo.planes[faceInfo.side0].origin;
            parallelFace(context, id + "endFace1", bodyFaces[faceInfo.side0], midPlane);

            midPlane.origin = faceInfo.planes[faceInfo.side1].origin;
            parallelFace(context, id + "endFace2", bodyFaces[faceInfo.side1], midPlane);
        }

        // get faces from body specified as the one to have the pins
        const pinSide = definition.pinSide ? 1 : 0;
        const tailSide = definition.tailSide ? 0 : 1;

        var offset = definition.edgeOffset ? definition.startOffset + definition.endOffset : 0 * meter;

        // get normal distance between opposing faces
        const pinSize = (evDistance(context, { "side0" : bodyFaces[faceInfo.side0], "extendSide0" : true, "side1" : bodyFaces[faceInfo.side1], "extendSide1" : true }).distance - offset) / (definition.numPins * 2 - 1);

        var pinBodies = [qCreatedBy(id + ("pin0"), EntityType.BODY)];

        for (var i = 1; i < definition.numPins - 1; i += 1) //duplicate original boolean for each pin
        {
            transform(context, id + ("pin" ~ i), {
                        "entities" : qCreatedBy(id + "pin0", EntityType.BODY),
                        "transformType" : TransformType.COPY,
                        "makeCopy" : true
                    });
            pinBodies = append(pinBodies, qCreatedBy(id + ("pin" ~ i), EntityType.BODY));
        }

        for (var i = 0; i < definition.numPins - 1; i += 1)
        {
            var bodyFaces = evaluateQuery(context, qCreatedBy(id + ("pin" ~ i), EntityType.FACE));
            var faceInfo = getFaceInfo(context, id, bodyFaces, [], false);
            var startOffset = 0 * meter;
            var endOffset = 0 * meter;

            if (definition.edgeOffset)
            {
                startOffset = definition.startOffset;
                endOffset = definition.endOffset;
            }

            var offset1 = (2 * (i + 1) - 1) * pinSize * -1 - startOffset;
            var offset2 = (2 * (definition.numPins - (i + 1)) - 1) * pinSize * -1 - endOffset;

            opOffsetFace(context, id + ("offsetFace1" ~ i), {
                        "moveFaces" : bodyFaces[faceInfo.side0],
                        "offsetDistance" : offset1
                    });

            opOffsetFace(context, id + ("offsetFace2" ~ i), {
                        "moveFaces" : bodyFaces[faceInfo.side1],
                        "offsetDistance" : offset2
                    });

            if (definition.dovetail)
            {
                neutralPlane.origin = evSurfaceDefinition(context, { "face" : bodyFaces[faceInfo.side0] }).origin;

                opPlane(context, id + ("plane1" ~ i), {
                            "plane" : neutralPlane,
                            "width" : 0.1 * meter,
                            "height" : 0.1 * meter
                        });

                opDraft(context, id + ("draft1" ~ i), {
                            "neutralPlane" : qCreatedBy(id + ("plane1" ~ i), EntityType.FACE),
                            "pullVec" : -1 * neutralPlane.normal * (1 - 2 * ((pinSide + tailSide) % 2)),
                            "draftFaces" : bodyFaces[faceInfo.side0],
                            "angle" : definition.dovetailAngle
                        });

                neutralPlane.origin = evSurfaceDefinition(context, { "face" : bodyFaces[faceInfo.side1] }).origin;

                opPlane(context, id + ("plane2" ~ i), {
                            "plane" : neutralPlane,
                            "width" : 0.1 * meter,
                            "height" : 0.1 * meter
                        });

                opDraft(context, id + ("draft2" ~ i), {
                            "neutralPlane" : qCreatedBy(id + ("plane2" ~ i), EntityType.FACE),
                            "pullVec" : -1 * neutralPlane.normal * (1 - 2 * ((pinSide + tailSide) % 2)),
                            "draftFaces" : bodyFaces[faceInfo.side1],
                            "angle" : definition.dovetailAngle
                        });

                opDeleteBodies(context, id + ("deleteBodies" ~ i), {
                            "entities" : qUnion([qCreatedBy(id + ("plane1" ~ i)), qCreatedBy(id + ("plane2" ~ i))])
                        });
            }
        }

        opBoolean(context, id + "booleanA", {
                    "tools" : qUnion(pinBodies),
                    "targets" : panelBodies[pinSide],
                    "operationType" : BooleanOperationType.SUBTRACTION
                });

        opBoolean(context, id + "booleanB", {
                    "tools" : panelBodies[pinSide],
                    "targets" : panelBodies[1 - pinSide],
                    "operationType" : BooleanOperationType.SUBTRACTION,
                    "keepTools" : true
                });
    });

function getFaceInfo(context is Context, id is Id, faces is array, panelBodies is array, tailSide is boolean) returns map
{
    // This function finds the two farthest faces belonging to the intersecting body
    // These faces are used to determine the size and angle of the pins
    // Also detects which face on the intersecting body is inside one of the parts and uses that as the dovetail neutral plane

    var panelFaces;
    var planeArray = [];
    var maxDistance = 0;

    if (size(panelBodies) > 0)
    {
        panelFaces = qOwnedByBody(panelBodies[tailSide ? 0 : 1], EntityType.FACE);
    }

    for (var i = 0; i < size(faces); i += 1)
    {
        planeArray = append(planeArray, evFaceTangentPlane(context, {
                        "face" : faces[i],
                        "parameter" : vector(0.5, 0.5)
                    }));
    }

    var faceInfo = { "side0" : 0, "side1" : 0, "planes" : planeArray };

    for (var i = 0; i < size(faces); i += 1)
    {
        for (var j = 0; j < i; j += 1)
        {
            var distance = norm(planeArray[i].origin - planeArray[j].origin);

            if (distance > maxDistance)
            {
                maxDistance = distance;
                faceInfo.side0 = i;
                faceInfo.side1 = j;
            }
        }

        if (size(panelBodies) > 0)
        {
            var faceFound = qContainsPoint(panelFaces, planeArray[i].origin);

            if (size(evaluateQuery(context, faceFound)) == 0) // if face is inside the body
            {
                faceInfo.neutralPlane = planeArray[i];
            }
        }
    }

    faceInfo.intersection = intersection(planeArray[faceInfo.side0], planeArray[faceInfo.side1]);

    return faceInfo;
}

function parallelFace(context is Context, id is Id, face is Query, plane is Plane)
{
    // This function uses replace face to shorten each pin
    // If the replace face fails it tries replacing using the plane with the normal flipped

    opPlane(context, id + "endPlane", {
                "plane" : plane,
                "width" : 0.1 * meter,
                "height" : 0.1 * meter
            });
    try
    {
        opReplaceFace(context, id + "replaceFace1", {
                    "replaceFaces" : face,
                    "templateFace" : qCreatedBy(id + "endPlane", EntityType.FACE)
                });
    }
    catch
    {
        opReplaceFace(context, id + "replaceFace2", {
                    "replaceFaces" : face,
                    "templateFace" : qCreatedBy(id + "endPlane", EntityType.FACE),
                    "oppositeSense" : true
                });
    }

    opDeleteBodies(context, id + "deleteEndPlane", {
                "entities" : qCreatedBy(id + "endPlane")
            });
}

export function jointLogic(context is Context, id is Id, oldDefinition is map, definition is map) returns map
{
    if (oldDefinition.bodies != definition.bodies)
    {
        const panelBodies = evaluateQuery(context, definition.bodies);

        if (size(panelBodies) < 2)
        {
            definition.pinPlane = false;
            return definition;
        }

        opBoolean(context, id + ("boolean"), {
                    "tools" : definition.bodies,
                    "operationType" : BooleanOperationType.INTERSECTION,
                    "keepTools" : true
                });

        // find all faces belonging to resultant body
        var bodyFaces = evaluateQuery(context, qCreatedBy(id + "boolean", EntityType.FACE));

        if (size(bodyFaces) == 0)
        {
            return definition;
        }

        var faceInfo = getFaceInfo(context, id, bodyFaces, panelBodies, definition.tailSide);

        if (faceInfo.intersection != undefined) // If the end faces are non-parallel then make the plane selection field visible in the UI
        {
            definition.pinPlane = true;
        }
        else
        {
            definition.pinPlane = false;
        }
    }

    return definition;
}

export const PIN_BOUNDS =
{
            "min" : 2,
            "max" : 250,
            (unitless) : [2, 4, 250]
        } as IntegerBoundSpec;

export const DOVETAIL_BOUNDS =
{
            "min" : 3 * degree,
            "max" : 45 * degree,
            (degree) : [3, 8, 45]
        } as AngleBoundSpec;
