// https://cad.onshape.com/documents/51695bc13e3d9fb286023c70/w/f1e387898ad3a323b9fd9a6b/e/3a9512753b299d5fefc39f46

FeatureScript 370;
import(path : "onshape/std/geometry.fs", version : "370.0");

annotation { "Feature Type Name" : "Dogbone" }
export const dogbone = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Diameter" }
        isLength(definition.diameter, LENGTH_BOUNDS);

        annotation { "Name" : "Depth" }
        isLength(definition.depth, LENGTH_BOUNDS);

        annotation { "Name" : "Points to Modify", "Filter" : EntityType.VERTEX, "MaxNumberOfPicks" : 50 }
        definition.points is Query;

        annotation { "Name" : "Lines to Modify", "Filter" : EntityType.EDGE, "MaxNumberOfPicks" : 50 }
        definition.edges is Query;

        annotation { "Name" : "Face to Modify", "Filter" : EntityType.FACE, "MaxNumberOfPicks" : 1 }
        definition.face is Query;

    }
    {
        var plane is Plane = evFaceTangentPlane(context, {
                "face" : definition.face,
                "parameter" : vector(0.5, 0.5)
        });
        var zDir = -plane.normal;
        var part = qOwnerBody(definition.face);
        var count = 0;

        for (var edge in evaluateQuery(context, definition.edges))
        {
            var destList = qVertexAdjacent(edge, EntityType.VERTEX);
            var sourceList = qIntersection([qVertexAdjacent(edge, EntityType.VERTEX), definition.points]);
            for (var sourceQ in evaluateQuery(context, sourceList))
            {
                var sourceV is Vector = evVertexPoint(context, {
                    "vertex" : sourceQ
                });
                for (var destQ in evaluateQuery(context, qSubtraction(destList, sourceQ)))
                {
                    var destV is Vector = evVertexPoint(context, {
                        "vertex" : destQ
                    });
                    var top = sourceV + normalize(destV - sourceV) * (definition.diameter / 2.0);
                    var bottom = top + zDir * definition.depth;
                    fCylinder(context, id + ("cylinder" ~ count), {
                        "bottomCenter" : bottom,
                        "topCenter" : top,
                        "radius" : definition.diameter/2.0
                    });
                    count += 1;
                }
            }
        }
        for (var i = 0; i < count; i += 1)
        {
            opBoolean(context, id + ("boolean" ~ i), {
                "tools" : qCreatedBy(id + ("cylinder" ~ i), EntityType.BODY),
                "targets" : part,
                "operationType" : BooleanOperationType.SUBTRACTION
            });
        }
    });

annotation { "Feature Type Name" : "Corner Overcut" }
export const cornerOvercut = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Diameter" }
        isLength(definition.diameter, LENGTH_BOUNDS);

        annotation { "Name" : "Depth" }
        isLength(definition.depth, LENGTH_BOUNDS);

        annotation { "Name" : "Points to Modify", "Filter" : EntityType.VERTEX, "MaxNumberOfPicks" : 50 }
        definition.points is Query;

        annotation { "Name" : "Face to Modify", "Filter" : EntityType.FACE, "MaxNumberOfPicks" : 1 }
        definition.face is Query;

    }
    {
        var plane is Plane = evFaceTangentPlane(context, {
                "face" : definition.face,
                "parameter" : vector(0.5, 0.5)
        });
        var zDir = -plane.normal;
        var part = qOwnerBody(definition.face);
        var count = 0;

        for (var point in evaluateQuery(context, definition.points))
        {
            var edgeList = qIntersection([
                qVertexAdjacent(point, EntityType.EDGE),
                qEdgeAdjacent(definition.face, EntityType.EDGE)]);
            var destList = qSubtraction(qVertexAdjacent(edgeList, EntityType.VERTEX), point);
            var sourceV is Vector = evVertexPoint(context, {
                "vertex" : point
            });
            var sumV = vector(0, 0, 0);
            var hasSummed = false;
            for (var destQ in evaluateQuery(context, destList))
            {
                var destV is Vector = evVertexPoint(context, {
                    "vertex" : destQ
                });
                if (hasSummed)
                {
                    sumV = sumV + normalize(destV - sourceV);
                }
                else
                {
                    sumV = normalize(destV - sourceV);
                    hasSummed = true;
                }
            }
            println(sumV);

            var top = sourceV + normalize(sumV) * (definition.diameter / 2.0);
            var bottom = top + zDir * definition.depth;
            fCylinder(context, id + ("cylinder" ~ count), {
                "bottomCenter" : bottom,
                "topCenter" : top,
                "radius" : definition.diameter/2.0
            });

            count += 1;
        }
        for (var i = 0; i < count; i += 1)
        {
            opBoolean(context, id + ("boolean" ~ i), {
                "tools" : qCreatedBy(id + ("cylinder" ~ i), EntityType.BODY),
                "targets" : part,
                "operationType" : BooleanOperationType.SUBTRACTION
            });
        }
    });

