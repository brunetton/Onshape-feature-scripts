// https://cad.onshape.com/documents/57b7740ce4b002b1d76d73b8/w/74ebb8e6fc5c218c0891f528/e/988bd660c9f19993de7d74cc

FeatureScript 392;
import(path : "onshape/std/geometry.fs", version : "392.0");

// Imports used in interface
export import(path : "onshape/std/query.fs", version : "392.0");
export import(path : "onshape/std/tool.fs", version : "392.0");
export import(path : "onshape/std/patternUtils.fs", version : "392.0");

// Imports used internally
import(path : "onshape/std/curveGeometry.fs", version : "392.0");
import(path : "onshape/std/math.fs", version : "392.0");
import(path : "onshape/std/mathUtils.fs", version : "392.0");
import(path : "onshape/std/units.fs", version : "392.0");

/**
 * Performs a body, face, or feature Radial pattern. Internally, performs
 * an `applyPattern`, which in turn performs an `opPattern` or, for a feature
 * pattern, calls the feature function.
 */

annotation { "Feature Type Name" : "Circular Pattern" }
export const edgePattern = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        // main things
        annotation { "Name" : "Pattern type" }
        definition.patternType is PatternType;

        if (definition.patternType == PatternType.PART)
        {
            booleanStepTypePredicate(definition);

            annotation { "Name" : "Entities to pattern", "Filter" : EntityType.BODY && AllowMeshGeometry.YES }
            definition.entities is Query;
        }
        else if (definition.patternType == PatternType.FACE)
        {
            annotation { "Name" : "Faces to pattern",
                        "UIHint" : "ALLOW_FEATURE_SELECTION",
                        "Filter" : EntityType.FACE && ConstructionObject.NO && SketchObject.NO }
            definition.faces is Query;
        }
        else if (definition.patternType == PatternType.FEATURE)
        {
            annotation { "Name" : "Features to pattern" }
            definition.instanceFunction is FeatureList;
        }

        // axis
        annotation { "Name" : "Axis of pattern", "Filter" : QueryFilterCompound.ALLOWS_AXIS, "MaxNumberOfPicks" : 1 }
        definition.axis is Query;

        annotation { "Name" : "Angle" }
        isAngle(definition.angle, ANGLE_360_FULL_DEFAULT_BOUNDS);

        annotation { "Name" : "Instance count" }
        isInteger(definition.countAng, CIRCULAR_PATTERN_BOUNDS);

        annotation { "Name" : "Opposite angular direction", "UIHint" : "OPPOSITE_DIRECTION_CIRCULAR" }
        definition.oppositeAngularDirection is boolean;

        annotation { "Name" : "Angular seed instance" }
        isInteger(definition.seedAng, SECONDARY_PATTERN_BOUNDS);

        annotation { "Name" : "Equal spacing" }
        definition.equalSpace is boolean;

        annotation { "Name" : "Radial direction" }
        definition.hasRadialDirection is boolean;

        if (definition.hasRadialDirection)
        {
            annotation { "Name" : "Seed point", "Filter" : EntityType.VERTEX, "MaxNumberOfPicks" : 1 }
            definition.seedPoint is Query;

            annotation { "Name" : "Distance" }
            isLength(definition.distance, PATTERN_OFFSET_BOUND);

            annotation { "Name" : "Instance count" }
            isInteger(definition.countRad, SECONDARY_PATTERN_BOUNDS);

            annotation { "Name" : "Opposite radial direction", "UIHint" : "OPPOSITE_DIRECTION" }
            definition.oppositeRadialDirection is boolean;

            annotation { "Name" : "Radial seed instance" }
            isInteger(definition.seedRad, SECONDARY_PATTERN_BOUNDS);
        }

        if (definition.patternType == PatternType.PART)
        {
            booleanStepScopePredicate(definition);
        }
    }
    //-------------------------------------
    {
        if (definition.patternType == PatternType.FACE)
            definition.entities = definition.faces;

        checkInput(context, id, definition, false);

        if (definition.patternType == PatternType.FEATURE)
            definition.instanceFunction = valuesSortedById(context, definition.instanceFunction);

        var remainingTransform = getRemainderPatternTransform(context, { "references" : definition.entities });

        //Angular direction
        var direction1 = computePatternAxis(context, definition.axis, isFeaturePattern(definition.patternType), remainingTransform);
        if (direction1 == undefined)
            throw regenError(ErrorStringEnum.PATTERN_CIRCULAR_NO_AXIS, ["axis"]);

        var angle = definition.angle;
        if (definition.oppositeAngularDirection)
            angle *= -1;

        const count1 = definition.countAng;
        const seed1 = definition.seedAng - 1;
        if (!(definition.seedAng < count1))
            throw regenError("Angular seed instance is greater than the instance count", ["countAng", "seedAng"]);

        if (definition.equalSpace)
        {
            if (count1 < 2)
                throw regenError(ErrorStringEnum.PATTERN_INPUT_TOO_FEW_INSTANCES, ["instanceCount"]);

            const isFull = abs(abs(stripUnits(angle)) - (2 * PI)) < TOLERANCE.zeroAngle;
            const instCt = isFull ? count1 : count1 - 1;
            angle = angle / instCt; //with error check above, no chance of instCt < 1
        }

        //Radial direction
        var firstOffset = zeroVector(3) * meter;
        var offset = zeroVector(3) * meter;
        var count2 = 1;
        var seed2 = 0;
        if (definition.hasRadialDirection)
        {
            count2 = definition.countRad;
            seed2 = definition.seedRad - 1;
            if (!(definition.seedRad < count2))
                throw regenError("Radial seed instance is greater than the instance count", ["countRad", "seedRad"]);

            var centroid = evVertexPoint(context, { "vertex" : definition.seedPoint });
            var projection = project(direction1, centroid);
            var direction2 = line(projection, centroid - projection);

            //Generate sketch line to be used as query for computePatternOffset
            var plane = plane(projection, direction1.direction, direction2.direction);
            var sketch1 = newSketchOnPlane(context, id + "sketch1", { "sketchPlane" : plane });
            skLineSegment(sketch1, "line1", {
                        "start" : vector(0, 0) * meter,
                        "end" : vector(norm(centroid - projection), 0 * meter)
                    });
            skSolve(sketch1);


            const result = try(computePatternOffset(context, qCreatedBy(id + "sketch1", EntityType.EDGE),
                        definition.oppositeRadialDirection, definition.distance, isFeaturePattern(definition.patternType), remainingTransform));
            if (result != undefined)
                firstOffset = result.offset;
            else if (count2 > 1)
            {
                //if count2 = 1, we don't need a direction (i.e. we keep the angle only solution),
                //so only complain about direction if the count for radial direction is > 1.
                throw regenError(ErrorStringEnum.PATTERN_LINEAR_NO_DIR, ["directionTwo"]);
            }

            opDeleteBodies(context, id + "deleteBodies1", {
                    "entities" : qCreatedBy(id + "sketch1")
            });
        }

        verifyPatternSize(context, id, count1 * count2);

        var transforms = [];
        var instanceNames = [];
        const identity = identityMatrix(3);
        var rotation = identity;
        var instanceTransform = transform(identity, zeroVector(3) * meter);
        for (var j = 0 - seed2; j < count2 - seed2; j += 1)
        {
            var instName = j == 0 ? "" : ("_" ~ j);

            // skip recreating original
            for (var i = 0 - seed1; i < count1 - seed1; i += 1)
            {
                if (!(j == 0 && i == 0))
                {
                    if (i == 0) //no rotation, only translation
                    {
                        offset = firstOffset * j;
                        rotation = identity;
                        instanceTransform = transform(identity, offset);
                    }
                    else //rotation + translation
                    {
                        var rotationTransform = rotationAround(direction1, i * angle);
                        rotation = rotationTransform.linear;
                        if (j == 0)
                            offset = rotationTransform.translation;
                        else
                            offset = rotationTransform*firstOffset * j; //rotation of firstOffset
                    }

                    instanceTransform = transform(rotation, offset);
                    transforms = append(transforms, instanceTransform);
                    instanceNames = append(instanceNames, i ~ instName);
                }
            }
        }


        // actually do the pattern
        definition.transforms = transforms;
        definition.instanceNames = instanceNames;
        definition.seed = definition.entities;
        applyPattern(context, id + "pattern", definition, remainingTransform);
    });
