// https://cad.onshape.com/documents/d66ea5fec7a939e866ecbd6f/w/25d8c7ecb4fba2c4e6eb34a4/e/bedd99d11728e00fea7a1308

FeatureScript 1431;
import(path : "onshape/std/geometry.fs", version : "1431.0");

annotation { "Feature Type Name" : "Parameter pattern", "Feature Name Template" : "#nameTemplate", "UIHint" : "NO_PREVIEW_PROVIDED" }
export const parameterPattern = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Feature sequence" }
        definition.features is FeatureList;

        annotation { "Name" : "Table of parameters", "Item name" : "Parameter", "Item label template" : "Parameter (#varName)" }
        definition.varArray is array;
        for (var varMap in definition.varArray)
        {
            annotation { "Name" : "Variable name" }
            varMap.varName is string;

            annotation { "Name" : "Array" }
            isAnything(varMap.valueArray);
        }
    }
    {
        // Remap initial parameter table
        var parameterTable = [];
        const arraySize = size(definition.varArray[0].valueArray);

        for (var valueIndex = 0; valueIndex < arraySize; valueIndex += 1)
        {
            var parameterMap = {};
            for (var varMap in definition.varArray)
            {
                parameterMap[varMap.varName] = varMap.valueArray[valueIndex];
            }
            parameterTable = append(parameterTable, parameterMap);
        }

        //Save initial variable values
        const varNames = keys(parameterTable[0]);
        var initialVarMap = {};
        for (var varName in varNames)
        {
            initialVarMap[varName] = getVariable(context, varName);
        }

        //Apply feature pattern
        var i = 0;
        for (var parameterMap in parameterTable)
        {
            i += 1;

            for (var varNameValue in parameterMap)
            {
                setVariable(context, varNameValue.key, varNameValue.value);
            }

            applyPattern(context, id + ("pattern" ~ i), {
                        "patternType" : PatternType.FEATURE,
                        "instanceFunction" : definition.features,
                        "fullFeaturePattern" : true,
                        "transforms" : [identityTransform()],
                        "instanceNames" : ["pattern" ~ i]
                    }, identityTransform());

        }

        setFeatureComputedParameter(context, id, { "name" : "nameTemplate", "value" : varNames });

        //restore initial variable values
        for (var varMap in initialVarMap)
        {
            setVariable(context, varMap.key, varMap.value);
        }

    });
