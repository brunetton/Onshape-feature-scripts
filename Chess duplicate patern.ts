// https://cad.onshape.com/documents/836b32c33ff056dcc59e001b/w/b819e8285516b64018d0648c/e/55572aa2e303ead18d3547a9

FeatureScript 2411;
import(path : "onshape/std/common.fs", version : "2411.0");

annotation { "Feature Type Name" : "Chess duplicate patern", "Feature Type Description" : "" }
export const myFeature = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Entity", "Filter" : EntityType.BODY, "MaxNumberOfPicks" : 1 }
        definition.entity is Query;
        annotation { "Name" : "Rows" }
        isInteger(definition.rows, POSITIVE_COUNT_BOUNDS);
        annotation { "Name" : "Cols" }
        isInteger(definition.cols, POSITIVE_COUNT_BOUNDS);
        annotation { "Name" : "X spacing" }
        isLength(definition.xSpacing, NONNEGATIVE_ZERO_INCLUSIVE_LENGTH_BOUNDS);
        annotation { "Name" : "Y spacing" }
        isLength(definition.ySpacing, NONNEGATIVE_ZERO_INCLUSIVE_LENGTH_BOUNDS);
    }

    {
        // Iterate through rows
        var i = 0;
        // Get entity dimensions
        var box3D = evBox3d(context, {
            "topology" : definition.entity,
            "tight" : true
        });
        var entity_size =  box3D.maxCorner - box3D.minCorner;
        // debug(context, entity_size);
        var transforms = [];
        var names = [];
        for (var row = 0; row < definition.rows; row+=1) {
            // Determine starting column offset for odd rows
            var colOffset = row % 2 == 0 ? 0 : 1;

            // Iterate through columns with offset for odd rows
            for (var col = colOffset; col < definition.cols; col += 2) {
                if (row == 0 && col == 0) {
                    // nothing to do for the first one, just keep original one
                    continue;
                }

                names = append(names, id[0] ~ '-' ~ i);
                // debug(context, "row-col: " ~ row ~ "-" ~ col);
                transforms = append(transforms, transform(vector(
                    row*(entity_size[0] + definition.xSpacing),
                    col*(entity_size[1] + definition.ySpacing),
                    0*inch
                )));
                i += 1;
            }
        }
        opPattern(context, id + "pattern", {
                "entities" : definition.entity,
                "transforms" : transforms,
                "instanceNames" : names
        });

    }
);
