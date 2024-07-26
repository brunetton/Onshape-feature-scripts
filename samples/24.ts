// https://cad.onshape.com/documents/2e01af46ce2cd5b90ee41156/w/82761270dd57ac2be5d84860/e/07d90733290048348a35bc64

FeatureScript 1634;
import(path : "onshape/std/geometry.fs", version : "1634.0");

annotation { "Feature Type Name" : "Tracer", "Feature Name Template" : "#nameTemplate", "UIHint" : "NO_PREVIEW_PROVIDED" }
export const myFeature = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Generating features", "Filter" : SketchObject.YES, "MaxNumberOfPicks" : 2 }
        definition.instanceFunction is FeatureList;

        annotation { "Name" : "Driving variable name" }
        definition.varName is string;

        annotation { "Name" : "Min value" }
        isAnything(definition.minValue);

        annotation { "Name" : "Max value" }
        isAnything(definition.maxValue);

        annotation { "Name" : "Step" }
        isAnything(definition.step);

        annotation { "Name" : "Driving unit per mm" }
        isAnything(definition.drivingUnit);

        annotation { "Name" : "Driven variable name" }
        definition.resultVarName is string;

        annotation { "Name" : "Driven unit per mm" }
        isAnything(definition.drivenUnit);
    }
    {
        const initialValue = getVariable(context, definition.varName);

        const instanceNumber = round((definition.maxValue - definition.minValue) / definition.step);

        var resultList = [];
        var traceOutput = "";
        for (var i, value in range(definition.minValue, definition.maxValue, instanceNumber))
        {
            const patternId = id + i;

            setVariable(context, definition.varName, value);

            applyPattern(context, patternId, {
                        "patternType" : PatternType.FEATURE,
                        "fullFeaturePattern" : true,
                        "instanceFunction" : definition.instanceFunction,
                        "transforms" : [identityTransform()],
                        "instanceNames" : ["pattern"]
                    }, identityTransform());

            const drivenValue = getVariable(context, definition.resultVarName);

            const valueUnitless = value / definition.drivingUnit;
            const resultUnitless = drivenValue / definition.drivenUnit;

            traceOutput ~= "{" ~ toString(valueUnitless) ~ "," ~ toString(resultUnitless) ~ "},";

            resultList = append(resultList, [valueUnitless * millimeter, resultUnitless * millimeter] as Vector);

            try silent
            {
                opDeleteBodies(context, id + ("delete" ~ i), {
                            "entities" : qCreatedBy(patternId)
                        });
            }
        }

        println("Trace " ~ definition.resultVarName ~ "(" ~ definition.varName ~ ": " ~ toString(definition.drivingUnit) ~ "): " ~ toString(definition.drivenUnit));
        println("{" ~ traceOutput ~ "}");
        println("End of trace output ");
        println("");

        const sk = newSketchOnPlane(context, id, { "sketchPlane" : XY_PLANE });

        skFitSpline(sk, "dependencyGraph", { "points" : resultList });

        skSolve(sk);

        setFeatureComputedParameter(context, id, {
                    "name" : "nameTemplate",
                    "value" : "Trace " ~ definition.resultVarName ~ "(" ~ definition.varName ~ ": " ~ toString(definition.drivingUnit) ~ "): " ~ toString(definition.drivenUnit)
                });

        setVariable(context, definition.varName, initialValue);
    });
