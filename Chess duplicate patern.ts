// https://cad.onshape.com/documents/836b32c33ff056dcc59e001b/w/b819e8285516b64018d0648c/e/55572aa2e303ead18d3547a9

FeatureScript 2411;
import(path : "onshape/std/common.fs", version : "2411.0");


export enum BoolOpts {
    annotation { "Name" : "New" }       NEW_BODIES,
    annotation { "Name" : "Union" }     UNION,
    annotation { "Name" : "Subtract" }  SUBTRACT,
    annotation { "Name" : "Intersect" } INTERSECT,
}

annotation { "Feature Type Name" : "Chess duplicate patern", "Feature Type Description" : "Duplicate selected part using to create a chess board like pattern." }
export const chessPattern = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Boolean", "UIHint" : "HORIZONTAL_ENUM" }
        definition.bool is BoolOpts;

        if (definition.bool != BoolOpts.NEW_BODIES) {
            annotation { "Name" : "Merge scope", "Filter" : EntityType.BODY && BodyType.SOLID }
            definition.mergeScope is Query;
        }
        annotation { "Name" : "Entity", "Filter" : EntityType.BODY && BodyType.SOLID, "MaxNumberOfPicks" : 1 }
        definition.entity is Query;
        annotation { "Name" : "Rows", "UIHint" : "REMEMBER_PREVIOUS_VALUE"}
        isInteger(definition.rows, POSITIVE_COUNT_BOUNDS);
        annotation { "Name" : "Flip", "UIHint" : UIHint.OPPOSITE_DIRECTION }
        definition.colsFlipped is boolean;
        annotation { "Name" : "Cols", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isInteger(definition.cols, POSITIVE_COUNT_BOUNDS);
        annotation { "Name" : "Flip", "UIHint" : UIHint.OPPOSITE_DIRECTION }
        definition.rowsFlipped is boolean;
        annotation { "Name" : "X spacing", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.xSpacing, { (millimeter) : [-100000000, 0, 100000000] } as LengthBoundSpec);
        annotation { "Name" : "Y spacing", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.ySpacing, { (millimeter) : [-100000000, 0, 100000000] } as LengthBoundSpec);
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
        // flip directions if asked
        var rowsDirection = 1;
        var colsDirection = -1;
        if (definition.rowsFlipped) rowsDirection = -1;
        if (definition.colsFlipped) colsDirection = 1;
        var transforms = [];
        var names = [];
        // Prepare transforms and names arrrays that will be passed to opPattern()
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
                    rowsDirection * row * (entity_size[0] + definition.xSpacing),
                    colsDirection * col * (entity_size[1] + definition.ySpacing),
                    0*inch
                )));
                i += 1;
            }
        }

        // Finally call opPattern()
        var featureId = id + "pattern";
        opPattern(context, featureId, {
                "entities" : definition.entity,
                "transforms" : transforms,
                "instanceNames" : names
        });

        if (definition.bool != BoolOpts.NEW_BODIES) {
            // Execute boolean operations
            var tools = qUnion(qCreatedBy(featureId, EntityType.BODY), definition.entity);
            // debug(context, tools, DebugColor.YELLOW);
            var boolType;
            if (definition.bool == BoolOpts.UNION) boolType = BooleanOperationType.UNION;
            if (definition.bool == BoolOpts.SUBTRACT) boolType = BooleanOperationType.SUBTRACTION;
            if (definition.bool == BoolOpts.INTERSECT) boolType = BooleanOperationType.INTERSECTION;
            try {
                opBoolean(context, id + "boolean1", {
                    "operationType" : boolType,
                    "tools" : tools,
                    "targets" : definition.mergeScope,
                    "targetsAndToolsNeedGrouping" : true,
                });
            }
            catch (error) {
                throw regenError("Error executing " ~ boolType ~ " boolean operation");
            }
        }
    }
);

