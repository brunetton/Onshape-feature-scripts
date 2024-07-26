// https://cad.onshape.com/documents/57df36a88f63301089e8ac78/w/d336a806a8a6f0460f7bd440/e/98edd4606a5baad492f0bd38

/*
    Kerf Compensation

    This custom feature offsets all laser-cut edges of a set of planar parts to comensate for the kerf
    when cutting with a laser/waterjet cutter that does not compensate for the kerf.

    Version 1.0     - July  6, 2016 - Arul Suresh - Initial development and validation.
    Version 1.1     - Sept 18, 2016 - Arul Suresh - Added documentation, public release.
    Version 2.0     - Jan  13, 2017 - Arul Suresh - Added option of selecting parts by thickness.
    Version 2.1     - Feb  17, 2017 - Arul Suresh - Updated to latest published version of laser utils.
                                                    Updated mode to use horizontal enum UI.
                                                    Updated documentation to reflect new UI.
    Version 2.1.1   - Dec   8, 2023 - Arul Suresh - Added feature description for publication.
*/

FeatureScript 505;
import(path : "onshape/std/geometry.fs", version : "505.0");

// Import Kerf Comp. operation type
export import(path : "dcf1d11bedd5bffd5fa7cb28", version : "5c4bd512d1a82224c5d23820");

// Import Laser Utils V2.0
import(path : "f4e7238da5afaf5a3f1498c0/da8967899398095c3e5a473b/22d17eb94c85900576fbf53e", version : "e2e74e5487fceac10f7cd826");

// Import custom icon
IconData::import(path : "cc74e32c4661fa08bea995ae", version : "c712aabb54d1d21fa7673e2a");




annotation { "Feature Type Name" : "Kerf Compensation",
        "Feature Type Description" : "Offsets exterior edges of a planar part for laser cutting.<br><br>" ~
        "This feature assumes that the parts <b>are planar</b> " ~
        "and that the <b>largest face determines the cutting plane</b>.",
        "Editing Logic Function" : "kcLogic",
        "Icon" : IconData::BLOB_DATA }
export const kerfCompensate = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Operation type", "UIHint" : "HORIZONTAL_ENUM" }
        definition.operationType is KerfCompensationOperationType;

        if (definition.operationType == KerfCompensationOperationType.SELECTION)
        {
            annotation { "Name" : "Parts to adjust", "Filter" : EntityType.BODY && BodyType.SOLID }
            definition.parts is Query;
        }
        else
        {
            annotation { "Name" : "Thickness of parts", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
            isLength(definition.thickness, THICKNESS_LENGTH_BOUNDS);
        }

        annotation { "Name" : "Kerf", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.K, ZERO_DEFAULT_LENGTH_BOUNDS);

        annotation { "Name" : "Allowance", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.A, ZERO_DEFAULT_LENGTH_BOUNDS);
    }
    {
        var parts = evaluateQuery(context, definition.parts);
        var N = size(parts);

        // For each selected part:
        //      Select all faces that are not the top and bottom faces
        //      Offset these faces by half of the kerf less the allowance (0.5K - A)

        for (var i = 0; i < N; i += 1)
        {
            var sortedFaces = getSortedFaceList(context, parts[i], SortDirection.DESCENDING);

            var allFaces = qOwnedByBody(parts[i], EntityType.FACE);
            var edgeFaces = qSubtraction(allFaces, qUnion([sortedFaces[0], sortedFaces[1]]));

            opOffsetFace(context, id + i + "offsetFace", {
                        "moveFaces" : edgeFaces,
                        "offsetDistance" : 0.5 * definition.K - definition.A
                    });
        }
    });

/**
 * Editing logic function, updates selected parts.
 * If anything changes in the feature definition, checks if selection by thickness is active.
 * If so, sets definition.parts to all laser-cuttable parts with the given thickness.
 */
export function kcLogic(context is Context, id is Id, oldDefinition is map, definition is map,
    isCreating is boolean, specifiedParameters is map, hiddenBodies is Query) returns map
{
    if (definition.operationType == KerfCompensationOperationType.AUTO)
    {
        var laserCutParts = qFilterFunction(
        qBodyType(qEverything(EntityType.BODY), BodyType.SOLID),
        context,
        function(x)
        {
            return canBeLaserCut(context, x);
        });

        var selected = qFilterFunction(
        laserCutParts,
        context,
        function(x)
        {
            return tolerantEquals(getThickness(context, x), definition.thickness);
        });

        definition.parts = selected;
    }

    return definition;
}

export const THICKNESS_LENGTH_BOUNDS =
{
            (meter) : [1e-5, 0.01, 500],
            (centimeter) : 0.6,
            (millimeter) : 5,
            (inch) : 0.25,
            (foot) : 0.1,
            (yard) : 0.1
        } as LengthBoundSpec;
