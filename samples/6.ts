// https://cad.onshape.com/documents/57ebf15e06acf910d5ac1b09/w/5ad1d8c8be840c2c6f8f02b6/e/e9cb43990a29d220cf63c921

FeatureScript 355;
import(path : "onshape/std/geometry.fs", version : "355.0");
icon::import(path : "84f03accc4a9d1b667e1a64a", version : "305de269de455204f56323af");

annotation { "Feature Type Name" : "Mortise Tenon", "Editing Logic Function" : "jointLogic", "Filter Selector" : "fs", "Icon" : icon::BLOB_DATA }
export const MortiseTenon = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Select tenon edge", "Filter" : (EntityType.EDGE && GeometryType.LINE && ConstructionObject.NO && SketchObject.NO), "MaxNumberOfPicks" : 1 }
        definition.edge is Query;

        annotation { "Name" : "Tenon width", "Default" : widthType.WIDTH1, "UIHint" : "REMEMBER_PREVIOUS_VALUE"}
        definition.widthType is widthType;

        if (definition.widthType == widthType.CUSTOM)
        {
            annotation { "Name" : "Width", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
            isLength(definition.width, NONNEGATIVE_LENGTH_BOUNDS);
        }

        annotation { "Name" : "Tenon length", "Default" : endType.DEPTH2, "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        definition.endType is endType;

        if (definition.endType == endType.CUSTOM)
        {
            annotation { "Name" : "Length", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
            isLength(definition.length, NONNEGATIVE_LENGTH_BOUNDS);
        }

        if (definition.endType != endType.THROUGH)
        {
            annotation { "Name" : "Clearance", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
            isLength(definition.clearance, CLEARANCE);

            annotation { "Name" : "Chamfer", "Default" : true, "UIHint" : ["DISPLAY_SHORT","REMEMBER_PREVIOUS_VALUE"] }
            definition.chamfer is boolean;

            if (definition.chamfer)
            {
                annotation { "Name" : "Chamfer width", "UIHint" : ["DISPLAY_SHORT","REMEMBER_PREVIOUS_VALUE"] }
                isLength(definition.chamferSize, CHAMFER);
            }
        }
    }
    {
        const tenonBody = qOwnerBody(definition.edge);

        const mortiseBody = qSubtraction(qContainsPoint(qBodyType(qEverything(EntityType.BODY), BodyType.SOLID),
                    evEdgeTangentLine(context, { "edge" : definition.edge, "parameter" : 0.5 }).origin), tenonBody);

        if (evaluateQuery(context, mortiseBody) == [])
        {
            throw regenError("Selected edge is not adjacent to another body", ["edge"]);
        }

        const railFaces = qEdgeAdjacent(definition.edge, EntityType.FACE);

        // Only possible to have two faces for one edge so find the area for each face
        const faceAreas = [evArea(context, { "entities" : qNthElement(railFaces, 0) }), evArea(context, { "entities" : qNthElement(railFaces, 1) })];

        var faceIndex = 0;

        if (faceAreas[0] > faceAreas[1]) // Find which face is the smallest and therefore the tenon face
        {
            faceIndex = 1;
        }

        var tenonFace = evFaceTangentPlane(context, { "face" : qNthElement(railFaces, faceIndex), "parameter" : vector(0.5, 0.5) });

        const mortiseFace = qContainsPoint(qOwnedByBody(mortiseBody, EntityType.FACE), tenonFace.origin);

        if (evArea(context, { "entities" : mortiseFace }) < faceAreas[faceIndex])
        {
            throw regenError("Selected edge belongs to the wrong body", ["edge"]);
        }

        tenonFace.x = evLine(context, { "edge" : definition.edge }).direction;

        const tenonFaceBox = evBox3d(context, { "topology" : qNthElement(railFaces, faceIndex), "cSys" : planeToCSys(tenonFace) });

        const tenonSketch = newSketchOnPlane(context, id + "tenonSketch", { "sketchPlane" : tenonFace });

        skRectangle(tenonSketch, "tenonFace", {
                    "firstCorner" : vector(tenonFaceBox.minCorner[0], tenonFaceBox.minCorner[1]),
                    "secondCorner" : vector(tenonFaceBox.maxCorner[0], tenonFaceBox.maxCorner[1])
                });

        skSolve(tenonSketch);

        var offset = tenonFaceBox.maxCorner[0] - tenonFaceBox.minCorner[0];

        if (offset > tenonFaceBox.maxCorner[1] - tenonFaceBox.minCorner[1])
        {
            offset = tenonFaceBox.maxCorner[1] - tenonFaceBox.minCorner[1];
        }

        opExtrude(context, id + "tenon", {
                    "entities" : qCreatedBy(id + "tenonSketch", EntityType.FACE),
                    "direction" : tenonFace.normal,
                    "endBound" : BoundingType.UP_TO_BODY,
                    "endBoundEntity" : mortiseBody
                });

        const endFace = qEntityFilter(qCapEntity(id + "tenon", false), EntityType.FACE);

        const endFaceCenter = evFaceTangentPlane(context, { "face" : endFace, "parameter" : vector(0.5, 0.5) }).origin;

        const tenonFaces = qSubtraction(qSubtraction(qCreatedBy(id + "tenon", EntityType.FACE), endFace), qEntityFilter(qCapEntity(id + "tenon", true), EntityType.FACE));

        if (definition.widthType == widthType.WIDTH1)
            offset /= 3;
        if (definition.widthType == widthType.WIDTH2)
            offset /= 4;
        if (definition.widthType == widthType.CUSTOM)
            offset = (offset - definition.width) / 2;

        opOffsetFace(context, id + "offsetSideFaces", {
                    "moveFaces" : tenonFaces,
                    "offsetDistance" : offset * -1
                });

        if (definition.endType != endType.THROUGH)
        {
            var depth = evDistance(context, { "side0" : tenonFace.origin, "side1" : endFace }).distance;

            if (definition.endType == endType.DEPTH1)
                depth /= -2;
            if (definition.endType == endType.DEPTH2)
                depth /= -3;
            if (definition.endType == endType.CUSTOM)
                depth = definition.length - depth;

            opOffsetFace(context, id + "offsetEndFace", {
                        "moveFaces" : endFace,
                        "offsetDistance" : depth
                    });
        }

        opBoolean(context, id + "booleanMortise", {
                    "tools" : qCreatedBy(id + "tenon", EntityType.BODY),
                    "targets" : mortiseBody,
                    "operationType" : BooleanOperationType.SUBTRACTION,
                    "keepTools" : true
                });

        if (definition.endType != endType.THROUGH)
        {
            opOffsetFace(context, id + "offsetEndFaceClearance", {
                        "moveFaces" : endFace,
                        "offsetDistance" : definition.clearance * -1
                    });

            if (definition.chamfer)
            {
                opChamfer(context, id + "chamferEndFace", {
                            "entities" : qEdgeAdjacent(endFace, EntityType.EDGE),
                            "chamferType" : ChamferType.EQUAL_OFFSETS,
                            "width" : definition.chamferSize
                        });
            }
        }

        opBoolean(context, id + "booleanTenon", {
                    "tools" : qUnion([tenonBody, qCreatedBy(id + "tenon", EntityType.BODY)]),
                    "operationType" : BooleanOperationType.UNION
                });

        opDeleteBodies(context, id + "deleteBodies1", { "entities" : qCreatedBy(id + "tenonSketch") });
    });

export function jointLogic(context is Context, id is Id, oldDefinition is map, definition is map) returns map
{
    // if(definition.endType == endType.
    return definition;
}

export enum endType
{
    annotation { "Name" : "1/2 Depth" }
    DEPTH1,
    annotation { "Name" : "2/3 Depth" }
    DEPTH2,
    annotation { "Name" : "Through" }
    THROUGH,
    annotation { "Name" : "Custom" }
    CUSTOM
}

export enum widthType
{
    annotation { "Name" : "1/3 Width" }
    WIDTH1,
    annotation { "Name" : "1/2 Width" }
    WIDTH2,
    annotation { "Name" : "Custom" }
    CUSTOM
}

const CLEARANCE =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [0, 0.003, 500],
            (centimeter) : 0.3,
            (millimeter) : 3,
            (inch) : 0.125,
            (foot) : 0.01
        } as LengthBoundSpec;

const CHAMFER =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [1e-5, 0.0015, 500],
            (centimeter) : 0.15,
            (millimeter) : 1.5,
            (inch) : 0.0625,
            (foot) : 0.005
        } as LengthBoundSpec;

