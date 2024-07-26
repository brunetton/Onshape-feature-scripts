// https://cad.onshape.com/documents/9fca78cb66a0bc83e359eb3e/w/01ed403357f48b8904c9b631/e/7052b96c07018ad97bbadbf9

FeatureScript 1560;
export import(path : "onshape/std/common.fs", version : "1560.0");
pointPatternIcon::import(path : "9e86ebf436523a29af9bf32f/6603a05cec5be40e8a66a8b3/cd08a2b73e8f36bcd67ffd6b", version : "0194c98edc0b3e878e07a9cc");
pointPatternDescriptionImage::import(path : "a71ab7a335d49b5dc6bcfeea", version : "783d932f65e1ac165bb99790");

annotation {
        "Feature Type Name" : "Point Pattern",
        "Icon" : pointPatternIcon::BLOB_DATA,
        "Description Image" : pointPatternDescriptionImage::BLOB_DATA,
        "Feature Type Description" : "Creates multiple instances of parts, faces, or features at specified points" }
export const pointPattern = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        patternTypePredicate(definition);

        annotation { "Name" : "Reference Point", "Filter" : EntityType.VERTEX || BodyType.MATE_CONNECTOR, "MaxNumberOfPicks" : 1 }
        definition.reference is Query;

        annotation { "Name" : "Locations", "Filter" : EntityType.VERTEX || BodyType.MATE_CONNECTOR }
        definition.locations is Query;

        if (definition.patternType == PatternType.PART)
        {
            booleanPatternScopePredicate(definition);
        }

        if (definition.patternType == PatternType.FEATURE)
        {
            annotation { "Name" : "Apply per instance" }
            definition.fullFeaturePattern is boolean;
        }
    }
    {
        verifyNonemptyQuery(context, definition, "locations", "Select points to pattern");
        definition = adjustPatternDefinitionEntities(context, definition, false);

        // Determine where to pattern
        const locations = evaluateQuery(context, definition.locations);
        verifyPatternSize(context, id, size(locations));

        // Compute the origin
        var origin;
        if (evaluateQuery(context, definition.reference) == [])
        {
            var boxEntities;

            if (definition.patternType == PatternType.PART)
            {
                boxEntities = definition.entities;
            }
            else if (definition.patternType == PatternType.FACE)
            {
                boxEntities = definition.faces;
            }
            else if (definition.patternType == PatternType.FEATURE)
            {
                boxEntities = qCreatedBy(definition.instanceFunction);
            }

            const boxResult = evBox3d(context, { "topology" : boxEntities });
            origin = box3dCenter(boxResult);
        }
        else
        {
            origin = evVertexPoint(context, { "vertex" : definition.reference });
        }

        // Compute the transforms and instance names
        var remainingTransform = getRemainderPatternTransform(context, { "references" : qUnion([getReferencesForRemainderTransform(definition), definition.locations]) });
        var instanceNames = [];
        var transforms = [];
        var patternNumber = 1;
        for (var location in locations)
        {
            var point is Vector = evVertexPoint(context, { "vertex" : location });
            transforms = append(transforms, transform(point - origin));
            instanceNames = append(instanceNames, "" ~ patternNumber);
            patternNumber += 1;
        }
        definition.transforms = transforms;
        definition.instanceNames = instanceNames;
        definition.seed = definition.entities;

        //Pattern
        applyPattern(context, id, definition, remainingTransform);
    });
