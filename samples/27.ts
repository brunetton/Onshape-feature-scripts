// https://cad.onshape.com/documents/25a0a6dfaa76e64574a5e0db/w/ed2afaf5bd2d12066495dc84/e/4c62c06c4e0e4db3703a2d4c

FeatureScript 1364;

IconNamespace::import(path : "6937aa461119700a3a978600/1c0bdf09cb3203fed18172e2/adbd3c6b4cec47f5b4ee427d", version : "f22af4d9e097d10c7e24ab9c");

// Imports used in interface
export import(path : "onshape/std/query.fs", version : "1364.0");
export import(path : "onshape/std/tool.fs", version : "1364.0");
export import(path : "onshape/std/patternUtils.fs", version : "1364.0");

// Imports used internally
import(path : "onshape/std/curveGeometry.fs", version : "1364.0");
import(path : "onshape/std/math.fs", version : "1364.0");
import(path : "onshape/std/coordSystem.fs", version : "1364.0");
import(path : "onshape/std/vector.fs", version : "1364.0");

/**
 * Performs a body, face, or feature pattern. Internally, performs
 * an [applyPattern], which in turn performs an [opPattern] or, for a feature
 * pattern, calls the feature function.
 *
 * @param id : @autocomplete `id + "circularPattern1"`
 * @param definition {{
 *      @field patternType {PatternType}: @optional
 *              Specifies a `PART`, `FEATURE`, or `FACE` pattern. Default is `PART`.
 *              @autocomplete `PatternType.PART`
 *      @field entities {Query}: @requiredif{`patternType` is `PART`}
 *              The parts to pattern.
 *              @eg `qCreatedBy(id + "extrude1", EntityType.BODY)`
 *      @field faces {Query}: @requiredif{`patternType` is `FACE`}
 *              The faces to pattern.
 *      @field instanceFunction {FeatureList}: @requiredif{`patternType` is `FEATURE`}
 *              The [FeatureList] of the features to pattern.
 *
 * }}
 */
annotation { "Feature Type Name" : "Transform pattern", "Filter Selector" : "allparts", "Icon" : IconNamespace::BLOB_DATA }
export const transformPattern = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Pattern type" }
        definition.patternType is PatternType;

        if (definition.patternType == PatternType.PART)
        {
            booleanStepTypePredicate(definition);

            annotation { "Name" : "Entities to pattern", "Filter" : EntityType.BODY }
            definition.entities is Query;
        }
        else if (definition.patternType == PatternType.FACE)
        {
            annotation { "Name" : "Faces to pattern", "Filter" : EntityType.FACE && ConstructionObject.NO && SketchObject.NO && ModifiableEntityOnly.YES }
            definition.faces is Query;
        }
        else if (definition.patternType == PatternType.FEATURE)
        {
            annotation { "Name" : "Features to pattern" }
            definition.instanceFunction is FeatureList;
        }

        annotation { "Name" : "Reference point or mate connector", "Filter" : EntityType.VERTEX || BodyType.MATE_CONNECTOR, "MaxNumberOfPicks" : 1 }
        definition.refEntity is Query;

        annotation { "Name" : "Target points or mate connectors", "Filter" : EntityType.VERTEX || BodyType.MATE_CONNECTOR }
        definition.targetEntities is Query;

        annotation { "Name" : "Keep orientation" }
        definition.keepOrientation is boolean;

        if (definition.patternType == PatternType.PART)
        {
            booleanStepScopePredicate(definition);
        }
    }
    {
        definition = adjustPatternDefinitionEntities(context, definition, false);

        if (definition.patternType == PatternType.FEATURE)
            definition.fullFeaturePattern = true;

        const remainingTransform = getRemainderPatternTransform(context, { "references" : getReferencesForRemainderTransform(definition) });

        var transforms = [];
        var instanceNames = [];
        var i = 0;

        const refCS = getCoordSys(context, definition.refEntity, definition.keepOrientation);

        for (var targetEntity in evaluateQuery(context, definition.targetEntities))
        {
            const targetCS = getCoordSys(context, targetEntity, definition.keepOrientation);
            var instanceTransform = toWorld(targetCS) * fromWorld(refCS);
            transforms = append(transforms, instanceTransform);
            instanceNames = append(instanceNames, "" ~ i);
            i += 1;
        }

        definition.transforms = transforms;
        definition.instanceNames = instanceNames;
        definition.seed = definition.entities;


        applyPattern(context, id, definition, remainingTransform);

    }, { patternType : PatternType.PART, operationType : NewBodyOperationType.NEW });

function getCoordSys(context is Context, query is Query, keepOrientation is boolean) returns CoordSystem
{
    try silent
    {
        return evMateConnector(context, { "mateConnector" : query });
    }

    if (!keepOrientation)
    {
        try silent
        {
            const zAxis = evOwnerSketchPlane(context, { "entity" : query }).normal;
            const origin = evVertexPoint(context, { "vertex" : query });
            return coordSystem(origin, perpendicularVector(zAxis), zAxis);
        }
    }

    try silent
    {
        const origin = evVertexPoint(context, { "vertex" : query });
        return coordSystem(origin, vector(1, 0, 0), vector(0, 0, 1));
    }
}
