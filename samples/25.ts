// https://cad.onshape.com/documents/258a19506c555f400614c944/w/74e657ae2800105e2874589a/e/4b2ddc3bb55dd38bed6292e9

FeatureScript 1364;
import(path : "onshape/std/geometry.fs", version : "1364.0");
icon::import(path : "9ac5e3569bf3ff2f1ce13f39", version : "44fc9dc255bee107f34f05c4");

annotation { "Feature Type Name" : "Ray Tracer",  "Icon": icon::BLOB_DATA }
export const rayTracer = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Origin Point", "Filter" : EntityType.VERTEX, "MaxNumberOfPicks" : 1 }
        definition.origin is Query;

        annotation { "Name" : "Direction Point", "Filter" : EntityType.VERTEX }
        definition.directionPoint is Query;

        annotation { "Name" : "Maximum Depth", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        isInteger(definition.maxDepth, POSITIVE_COUNT_BOUNDS);

    }
    {
        const bodies = qAttributeFilter(qBodyType(qEverything(EntityType.BODY), BodyType.SOLID), {});

        const directionPoints = evaluateQuery(context, definition.directionPoint);
        const originQ = definition.origin;
        const patternTransformOrigin = getRemainderPatternTransform(context, {
                "references" : originQ
        });
        const patternTransformDirections = getRemainderPatternTransform(context, {
                "references" : qUnion(directionPoints)
        });
        const originPoint = patternTransformOrigin * evVertexPoint(context, {
                "vertex" : originQ
        });
        for (var i = 0; i < size(directionPoints); i += 1)
        {
            var directionPoint is Vector = patternTransformDirections * evVertexPoint(context, {
                    "vertex" : directionPoints[i]
                });
            var direction is Vector = normalize(directionPoint - originPoint);

            try silent
            {
                definition.medRef = getVariable(context, "mediumRefractionIndex");
            }
            catch
            {
                throw regenError("Set Up has not been performed");
            }

            var rayToTrace = line(originPoint, direction);
            var traceRayDef = {
                "rayToTrace" : rayToTrace,
                "recursionDepth" : 1,
                "medRef" : definition.medRef,
                "maxDepth" : definition.maxDepth,
                "hitsDone" : 0,
                "bodies" : bodies
            };
            const subId = id + unstableIdComponent(i);
            setExternalDisambiguation(context, subId, directionPoints[i]);
            traceSingleRay(context, subId + "curve", traceRayDef);
        }

    });



export function traceSingleRay(context is Context, id is Id, definition is map)
{

    var rayToTrace = definition.rayToTrace;

    var rayIntersectData = getRayIntersection(context, id, rayToTrace, definition.bodies);
    if (rayIntersectData == false)
    {
        return false;
    }
    const rayEndPoint = rayIntersectData.intersection;
    var intersectFace = rayIntersectData.entity;

    var n1 = definition.medRef;
    var n2 = getAttributes(context, {
                        "entities" : qOwnerBody(intersectFace)
                    })[0].indexOfRefraction;

    if(!(n2 is number))
        return false;

    var isReflective is boolean = getAttributes(context, {
                "entities" : qOwnerBody(intersectFace)
            })[0].isReflective;
    var isRefractive is boolean = getAttributes(context, {
                "entities" : qOwnerBody(intersectFace)
            })[0].isRefractive;

    var parameterVector = rayIntersectData.parameter;

    var surfaceNormal = zeroVector(3);
    try silent
    {
        surfaceNormal = evFaceTangentPlane(context, {
                        "face" : intersectFace,
                        "parameter" : parameterVector
                    }).normal;
    }
    catch
    {
        surfaceNormal = evFaceTangentPlane(context, {
                        "face" : intersectFace,
                        "parameter" : jitter(parameterVector)
                    }).normal;
    }


    //Makes sure that the normal is facing the right direction for our reflection/refraction calculations
    if (dot(surfaceNormal, rayToTrace.direction) > 0)
    {
        n1 = n2;
        n2 = definition.medRef;
        surfaceNormal *= -1;
    }

    if (definition.hitsDone < definition.maxDepth && isReflective)
    {
        var reflectedRay is Line = reflectRay(line(rayEndPoint, rayToTrace.direction), surfaceNormal);
        reflectedRay.origin = reflectedRay.origin + reflectedRay.direction * .000001 * inch;
        definition.rayToTrace = reflectedRay;

        traceSingleRay(context, id + "recurseReflect", definition);
    }
    if (definition.hitsDone < definition.maxDepth && isRefractive)
    {
        var refractedRay = refractRay(line(rayEndPoint, rayToTrace.direction), surfaceNormal, n1, n2);
        definition.rayToTrace = refractedRay;
        if (refractedRay != false)
        {
            traceSingleRay(context, id + "recurseRefract_R", definition);
        }
        else
        {
            if (!isReflective)
            {
                var reflectedRay is Line = reflectRay(line(rayEndPoint, rayToTrace.direction), surfaceNormal);
                reflectedRay.origin = reflectedRay.origin + reflectedRay.direction * .000001 * inch;
                definition.rayToTrace = reflectedRay;
                traceSingleRay(context, id + "recurseReflect_R", definition);
            }

        }
    }
}

export function jitter(paramVec is Vector)
{
    var jitterAmount = .0001; // This is so that at the very center of revolved lens, you don't throw an error.
    paramVec[0] = clamp(paramVec[0], jitterAmount, 1 - jitterAmount);
    paramVec[1] = clamp(paramVec[1], jitterAmount, 1 - jitterAmount);
    return paramVec;
}

export function getRayIntersection(context is Context, id is Id, rayToTrace is Line, bodies is Query)
{
    var rayResult = evRaycast(context, {
            "entities" : qSubtraction(qOwnedByBody(bodies, EntityType.FACE), qWithinRadius(qEverything(EntityType.FACE), rayToTrace.origin, TOLERANCE.zeroLength * meter)),
            "ray" : rayToTrace
        });
    if (rayResult == [])
    {
        opFitSpline(context, id + "endFitSpline", {
                    "points" : [
                            rayToTrace.origin,
                            rayToTrace.origin + rayToTrace.direction * inch
                        ]
                });
        return false;
    }
    rayResult = rayResult[0];


    opFitSpline(context, id + "fitSpline1", {
                "points" : [
                        rayToTrace.origin,
                        rayResult.intersection
                    ]
            });
    return rayResult;
}

export function reflectRay(rayToReflect is Line, normal)
{
    var reflectedRay = -2 * (dot(rayToReflect.direction, normal)) * normal + rayToReflect.direction;
    return line(rayToReflect.origin, reflectedRay);
}

//n1 is the material that the light is coming from, n2 is the material the light is going into.
export function refractRay(rayToRefract is Line, normal, n1, n2)
{
    var thetaI = angleBetween(-1 * rayToRefract.direction, normal);
    var radical = 1 - (n1 / n2) ^ 2 * (1 - cos(thetaI) ^ 2);
    if (radical < 0)
    {
        return false;
    }

    var v is Vector = n1 / n2 * normalize(rayToRefract.direction) + (n1 / n2 * cos(thetaI) - sqrt(radical)) * normalize(normal);

    return line(rayToRefract.origin, v);
}