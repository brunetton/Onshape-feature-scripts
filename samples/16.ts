// https://cad.onshape.com/documents/54d06a3b8abd1fcb0daba26b/w/00a336bf184d3800f0194a5c/e/832b517bd3d8c5c6f914d864

FeatureScript 1260;
import(path : "onshape/std/geometry.fs", version : "1260.0");
IconNamespace::
import(path : "651b4e1c0625515f5f8c7a21", version : "1e84c99217d2c0598f592f04");

const STRAIGHTNESS_BOUNDS =
{
            (unitless) : [0.5, 1.0, 3.0]
        } as RealBoundSpec;

const BEND_RADIUS_BOUNDS =
{
            (millimeter) : [1.0, 200, 499000.0]
        } as LengthBoundSpec;

export enum hoseSizeOptions
{
    annotation { "Name" : "PUN - 3 x 0,5" }
    D3mm,
    annotation { "Name" : "PUN - 4 x 0,75" }
    D4mm,
    annotation { "Name" : "PUN - 6 x 1" }
    D6mm,
    annotation { "Name" : "PUN - 8 x 1,25" }
    D8mm,
    annotation { "Name" : "PUN - 10 x 1,5" }
    D10mm,
    annotation { "Name" : "PUN - 12 x 2" }
    D12mm,
    annotation { "Name" : "PUN - 14 x 2" }
    D14mm,
    annotation { "Name" : "PUN - 16 x 2,5" }
    D16mm
}

export enum hoseColorOptions
{
    annotation { "Name" : "Blue" }
    ColorBlue,
    annotation { "Name" : "Black" }
    ColorBlack,
    annotation { "Name" : "Silver" }
    ColorSilver,
    annotation { "Name" : "Yellow" }
    ColorYellow,
    annotation { "Name" : "Green" }
    ColorGreen,
    annotation { "Name" : "Red" }
    ColorRed
}

annotation { "Feature Type Name" : "Hose Routing", "Feature Name Template" : "#featurename", "Icon" : IconNamespace::BLOB_DATA }
export const hoseRouting = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Start point", "Filter" : (EntityType.EDGE && GeometryType.CIRCLE) || (EntityType.EDGE && GeometryType.ARC), "MaxNumberOfPicks" : 1 }
        definition.startPoint is Query;

        annotation { "Name" : "Mid points (optional)", "UIHint" : UIHint.ALLOW_QUERY_ORDER, "Filter" : (EntityType.EDGE && GeometryType.CIRCLE) || (EntityType.EDGE && GeometryType.ARC) }
        definition.midPoints is Query;

        annotation { "Name" : "End point", "Filter" : (EntityType.EDGE && GeometryType.CIRCLE) || (EntityType.EDGE && GeometryType.ARC), "MaxNumberOfPicks" : 1 }
        definition.endPoint is Query;

        annotation { "Name" : "Start straightness" }
        isReal(definition.startStraightness, STRAIGHTNESS_BOUNDS);

        annotation { "Name" : "Flip Start Direction", "UIHint" : "OPPOSITE_DIRECTION" }
        definition.startFlip is boolean;

        annotation { "Name" : "Mid straightness" }
        isReal(definition.midStraightness, STRAIGHTNESS_BOUNDS);

        annotation { "Name" : "End straightness" }
        isReal(definition.endStraightness, STRAIGHTNESS_BOUNDS);

        annotation { "Name" : "Flip End Direction", "UIHint" : "OPPOSITE_DIRECTION" }
        definition.endFlip is boolean;

        annotation { "Name" : "Custom Size" }
        definition.custom is boolean;

        if (definition.custom != true)
        {
            annotation { "Name" : "Hose Size" }
            definition.hoseSize is hoseSizeOptions;
        }

        if (definition.custom)
        {
            annotation { "Name" : "Outer Diameter" }
            isLength(definition.outerDiameter, NONNEGATIVE_LENGTH_BOUNDS);

            annotation { "Name" : "Inner Diameter" }
            isLength(definition.innerDiameter, ZERO_DEFAULT_LENGTH_BOUNDS);

            annotation { "Name" : "Min. Bend Radius" }
            isLength(definition.minBendRadius, BEND_RADIUS_BOUNDS);

            annotation { "Name" : "Hose Description", "Default" : "Description" }
            definition.hoseDescription is string;

            annotation { "Name" : "Materialname", "Default" : "Material" }
            definition.materialName is string;

            annotation { "Name" : "Material Density" }
            isReal(definition.myMaterialDensity, { (unitless) : [0.0, 1, 25] } as RealBoundSpec);
        }

        annotation { "Name" : "Hose color" }
        definition.hoseColor is hoseColorOptions;
    }
    {
        //=========================================List with variables=========================================

        const tableSize = {
                hoseSizeOptions.D3mm : { outerDiameter : 3.0, innerDiameter : 2.1, minBendRadius : 9, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 3 x 0,5" },
                hoseSizeOptions.D4mm : { outerDiameter : 4.0, innerDiameter : 2.6, minBendRadius : 8, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 4 x 0,75" },
                hoseSizeOptions.D6mm : { outerDiameter : 6.0, innerDiameter : 4.0, minBendRadius : 16, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 6 x 1" },
                hoseSizeOptions.D8mm : { outerDiameter : 8.0, innerDiameter : 5.7, minBendRadius : 24, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 8 x 1,25" },
                hoseSizeOptions.D10mm : { outerDiameter : 10, innerDiameter : 7.0, minBendRadius : 28, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 10 x 1,5" },
                hoseSizeOptions.D12mm : { outerDiameter : 12, innerDiameter : 8.0, minBendRadius : 33, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 12 x 2" },
                hoseSizeOptions.D14mm : { outerDiameter : 14, innerDiameter : 9.8, minBendRadius : 45, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 14 x 2" },
                hoseSizeOptions.D16mm : { outerDiameter : 16, innerDiameter : 11., minBendRadius : 45, HoseMaterial : "TPE-U(PU)", Density : 1.25, HoseName : "Festo PUN - 16 x 2,5" },
            };

        var entrySize = tableSize[definition.hoseSize];

        var myOuterDiameter;
        var myInnerDiameter;
        var myMinBendRadius;
        var myHoseMaterial;
        var myDensity;
        var myHoseName;


        if (definition.custom != true)
        {
            myOuterDiameter = entrySize.outerDiameter * millimeter;
            myInnerDiameter = entrySize.innerDiameter * millimeter;
            myMinBendRadius = entrySize.minBendRadius * millimeter;
            myHoseMaterial = entrySize.HoseMaterial;
            myDensity = entrySize.Density;
            myHoseName = entrySize.HoseName;
        }
        else
        {
            myOuterDiameter = definition.outerDiameter;
            myInnerDiameter = definition.innerDiameter;
            myMinBendRadius = definition.minBendRadius;
            myHoseMaterial = definition.materialName;
            myDensity = definition.myMaterialDensity;
            myHoseName = definition.hoseDescription;
        }

        const tableColor = {
                hoseColorOptions.ColorBlue : { Red : 56, Green : 147, Blue : 246, Alpha : 1.0 },
                hoseColorOptions.ColorBlack : { Red : 73, Green : 73, Blue : 73, Alpha : 1.0 },
                hoseColorOptions.ColorSilver : { Red : 230, Green : 230, Blue : 235, Alpha : 1.0 },
                hoseColorOptions.ColorYellow : { Red : 236, Green : 211, Blue : 76, Alpha : 1.0 },
                hoseColorOptions.ColorGreen : { Red : 116, Green : 236, Blue : 76, Alpha : 1.0 },
                hoseColorOptions.ColorRed : { Red : 226, Green : 77, Blue : 28, Alpha : 1.0 }
            };

        var entryColor = tableColor[definition.hoseColor];

        var myRed = entryColor.Red;
        var myGreen = entryColor.Green;
        var myBlue = entryColor.Blue;
        var myAlpha = entryColor.Alpha;

        //===========================================================================================================================
        // Create Start- End- and MidPoints
        //===========================================================================================================================

        var startPoint is Vector = evCurveDefinition(context, { "edge" : definition.startPoint }).coordSystem.origin;
        var endPoint is Vector = evCurveDefinition(context, { "edge" : definition.endPoint }).coordSystem.origin;

        var midPoints = definition.midPoints;

        var evaluatedPoints = evaluateQuery(context, midPoints);
        var numPoints = size(evaluatedPoints);

        //===========================================================================================================================
        // Create arrays with points, normals, straightness, flips
        //===========================================================================================================================

        var allPoints = vector([startPoint]);
        var allNormals = vector([evCurveDefinition(context, { "edge" : definition.startPoint }).coordSystem.zAxis]);
        var allStraightness = [definition.startStraightness];

        // Add midPoints to arrays

        var currentPoint;
        var currentNormal;

        for (var i = 0; i < numPoints; i += 1)
        {
            currentPoint = qNthElement(definition.midPoints, i);
            currentNormal = qNthElement(definition.midPoints, i);
            try
            {
                allPoints = append(allPoints, evCurveDefinition(context, { "edge" : currentPoint }).coordSystem.origin);
                allNormals = append(allNormals, evCurveDefinition(context, { "edge" : currentNormal }).coordSystem.zAxis);
            }
            allStraightness = append(allStraightness, definition.midStraightness);
        }

        // Add EndPoint to arrays
        allPoints = append(allPoints, endPoint);
        allNormals = append(allNormals, evCurveDefinition(context, { "edge" : definition.endPoint }).coordSystem.zAxis);
        allStraightness = append(allStraightness, definition.endStraightness);

        //===========================================================================================================================
        // Create array with all distances
        //===========================================================================================================================

        var allDistances = [];

        for (var i = 0; i < size(allPoints) - 1; i += 1)
        {
            allDistances = append(allDistances, evDistance(context, {
                                "side0" : allPoints[i],
                                "side1" : allPoints[i + 1]
                            }).distance);
        }

        //===========================================================================================================================
        // Flip Normal if necessary
        //===========================================================================================================================

        if (dot(allNormals[0], normalize(allPoints[0] - allPoints[1])) >= 0)
        {
            allNormals[0] = allNormals[0] * -1;
        }

        for (var i = 0; i < size(allPoints) - 1; i += 1)
        {
            if (dot(allNormals[i + 1], normalize(allPoints[i] - allPoints[i + 1])) >= 0)
            {
                allNormals[i + 1] = allNormals[i + 1] * -1;
            }
        }

        //===========================================================================================================================
        // Apply start and end Normal flips (User input)
        //===========================================================================================================================

        if (definition.startFlip)
        {
            allNormals[0] = allNormals[0] * -1;
        }

        if (definition.endFlip)
        {
            allNormals[size(allPoints) - 1] = allNormals[size(allPoints) - 1] * -1;
        }

        //===========================================================================================================================
        // Create SplineSegments
        //===========================================================================================================================

        var derivativeSegmentStart;
        var derivativeSegmentEnd;

        var allSplines = qUnion([]);
        var deleteMeLater = qUnion([]);

        var minRadiusArray = [];

        var calculatedLength = 0;

        for (var i = 0; i < size(allPoints) - 1; i += 1)
        {
            derivativeSegmentStart = allNormals[i] * allDistances[i] * allStraightness[i];
            derivativeSegmentEnd = allNormals[i + 1] * allDistances[i] * allStraightness[i + 1];

            opFitSpline(context, id + ("fitSpline" ~ i), {
                        "points" : [allPoints[i], allPoints[i + 1]],
                        "startDerivative" : derivativeSegmentStart,
                        "endDerivative" : derivativeSegmentEnd
                    });
            deleteMeLater = qUnion([deleteMeLater, qCreatedBy(id + ("fitSpline" ~ i), EntityType.EDGE)]);
            allSplines = qUnion([allSplines, qCreatedBy(id + ("fitSpline" ~ i), EntityType.EDGE)]);

            //===========================================================================================================================
            // Get Minimal Bend Radius
            //===========================================================================================================================

            try silent
            {
                var curv = getMaxCurvature(context, qCreatedBy(id + ("fitSpline" ~ i), EntityType.EDGE));

                if (curv > 0.0 / meter)
                {
                    minRadiusArray = append(minRadiusArray, 1 / curv);

                    if (1 / curv < myMinBendRadius)
                    {
                        debug(context, qCreatedBy(id + ("fitSpline" ~ i), EntityType.EDGE));
                    }
                }
            }

            calculatedLength = calculatedLength + evLength(context, { "entities" : qCreatedBy(id + ("fitSpline" ~ i), EntityType.EDGE) }) / meter;
        }

        calculatedLength = roundToPrecision(calculatedLength, 3);

        var smallestRadius = min(minRadiusArray);

        if (smallestRadius < myMinBendRadius)
        {
            reportFeatureWarning(context, id, "Smallest Bend radius = " ~ toString(roundToPrecision(smallestRadius / meter * 1000, 1)) ~ " mm is too small!");

        }
        else
        {
            reportFeatureInfo(context, id, "Smallest Bend radius = " ~ toString(roundToPrecision(smallestRadius / meter * 1000, 1)) ~ " mm");
        }


        //===========================================================================================================================
        // Create Sketch with Outer Diameter
        //===========================================================================================================================

        var sketchplane = plane(evCurveDefinition(context, { "edge" : definition.startPoint }).coordSystem);
        var sketchId = id + "sketch1";

        var sketch1 = newSketchOnPlane(context, sketchId, {
                "sketchPlane" : sketchplane
            });

        skCircle(sketch1, "circle1", {
                    "center" : vector(0, 0) * inch,
                    "radius" : myOuterDiameter / 2
                });

        skSolve(sketch1);

        deleteMeLater = qUnion([deleteMeLater, qCreatedBy(sketchId, EntityType.BODY)]);

        //===========================================================================================================================
        // Create Sweep
        //===========================================================================================================================

        try
        {
            opSweep(context, id + "sweep1", {
                        "profiles" : qSketchRegion(sketchId, false),
                        "path" : allSplines
                    });
        }
        catch (error)
        {
            setErrorEntities(context, id, {
                        "entities" : allSplines
                    });
        }

        //===========================================================================================================================
        // Create Inner Wall
        //===========================================================================================================================

        //qCreatedBy(id + "sweep1", EntityType.BODY)

        if (myInnerDiameter > 0 * millimeter && myInnerDiameter < myOuterDiameter)
        {
            opShell(context, id + "shell1", {
                        "entities" : qGeometry(qCreatedBy(id + "sweep1", EntityType.FACE), GeometryType.PLANE),
                        "thickness" : -(myOuterDiameter - myInnerDiameter) / 2
                    });
        }

        //===========================================================================================================================
        // Set Name of Body, Feature and Description
        //===========================================================================================================================

        var myBody = qOwnerBody(qCreatedBy(id + "sweep1", EntityType.BODY));

        var lengthString is string = toString(calculatedLength);
        var completeString is string = "";

        if (definition.custom != true)
        {
            completeString = myHoseName ~ " - " ~ lengthString ~ "m";
        }
        else
        {
            completeString = definition.hoseDescription ~ " - " ~ lengthString ~ "m";
        }


        setProperty(context, {
                    "entities" : myBody,
                    "propertyType" : PropertyType.NAME,
                    "value" : completeString
                });

        setProperty(context, {
                    "entities" : myBody,
                    "propertyType" : PropertyType.DESCRIPTION,
                    "value" : completeString
                });

        // update the featurename
        setFeatureComputedParameter(context, id, {
                    "name" : "featurename",
                    "value" : completeString
                });


        //===========================================================================================================================
        // Set Color of Body
        //===========================================================================================================================

        setProperty(context, {
                    "entities" : myBody,
                    "propertyType" : PropertyType.APPEARANCE,
                    "value" : color(myRed / 255., myGreen / 255., myBlue / 255., myAlpha)
                });

        //===========================================================================================================================
        // Set Material Name and Density
        //===========================================================================================================================


        setProperty(context, {
                    "entities" : myBody,
                    "propertyType" : PropertyType.MATERIAL,
                    "value" : material(myHoseMaterial, myDensity * gram / centimeter ^ 3)
                });

        //===========================================================================================================================
        // Calculate and set Custom Weight (DEACTIVATED: To use make a copy of the document )
        //===========================================================================================================================

        //Calculate Area, Volume and Weight (This is much faster than using evVolume!)

        /* <- Delete this

           var area = myOuterDiameter ^ 2 * PI / 4 - myInnerDiameter ^ 2 * PI / 4;
           var volume = area * (calculatedLength * meter);
           var weight = volume * myDensity / meter ^ 3 * 1000.0;

           var weightKG is string = toString(roundToPrecision(weight, 3));
           weightKG ~= toString(" kg");

           setProperty(context, {
           "entities" : myBody,
           "propertyType" : PropertyType.CUSTOM,
           "value" : weightKG,
           "customPropertyId" : "YOUR_CUSTOM_ID_HERE"
           });

           Delete this -> */

        //===========================================================================================================================
        // Delete Splines and Sketches
        //===========================================================================================================================

        opDeleteBodies(context, id + "deleteBodies1", {
                    "entities" : deleteMeLater
                });
    });


function getMaxCurvature(context, query)
{
    var curvature;
    var maxCurvature = 0.0 / meter;
    var maxStartCurvature = 0.0 / meter;

    var maxPos;



    var pos = 0.0;

    // From Start

    var count = 20;
    var delta = 1 / count / 2;

    for (var i = 0; i <= count; i += 1)
    {
        pos = 1 / count * i;
        curvature = evEdgeCurvature(context, {
                        "edge" : query,
                        "parameter" : pos
                    }).curvature;


        if (curvature > maxStartCurvature)
        {
            maxStartCurvature = curvature;
            maxPos = pos;
        }
    }

    for (var j = 0; j < 10; j += 1)
    {
        var posForward = maxPos + delta;
        var posBackward = maxPos - delta;

        var curvatureForward = 0.0 / meter;
        var curvatureBackward = 0.0 / meter;

        if (posForward < 1.0)
        {
            curvatureForward = evEdgeCurvature(context, {
                            "edge" : query,
                            "parameter" : posForward
                        }).curvature;
        }

        if (posBackward > 0.0)
        {
            curvatureBackward = evEdgeCurvature(context, {
                            "edge" : query,
                            "parameter" : posBackward
                        }).curvature;
        }

        if (curvatureForward > maxStartCurvature)
        {
            maxPos = posForward;
            maxStartCurvature = curvatureForward;
        }

        if (curvatureBackward > maxStartCurvature)
        {
            maxPos = posBackward;
            maxStartCurvature = curvatureBackward;
        }

        delta = delta / 2;

    }

    maxCurvature = maxStartCurvature;

    return maxCurvature;
}
