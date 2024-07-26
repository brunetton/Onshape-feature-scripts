// https://cad.onshape.com/documents/5720a838e4b0c6d25c8c1ff1/w/59a90214cd1c32b3c6f17d3b/e/a501bce950220541db2e2ce8

/*
    Wave Spring

    This custom feature creates a wave spring at the origin
    with mate connectors at either end for easy transform or assembly.

    Version 1 - April 26, 2016 - Neil Cooke, Onshape Inc.
*/

FeatureScript 336;
import(path : "onshape/std/geometry.fs", version : "336.0");

annotation { "Feature Type Name" : "Wave Spring", "Feature Type Description" : "Wave spring."  }
export const waveSpring = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Outside Diameter", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.outerDiameter, LENGTH_BOUNDS);

        annotation { "Name" : "Inside Diameter", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.innerDiameter, INSIDE_DIA);

        annotation { "Name" : "Free height", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.freeHeight, LENGTH_BOUNDS);

        annotation { "Name" : "Number of turns", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isInteger(definition.turns, NUM_TURNS);

        annotation { "Name" : "Waves per turn", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isInteger(definition.waves, NUM_WAVES);

        annotation { "Name" : "Wire thickness", "UIHint" : "REMEMBER_PREVIOUS_VALUE" }
        isLength(definition.thickness, THICKNESS);
    }
    {
        var outerPoints = [];
        var innerPoints = [];
        const outerRadius = definition.outerDiameter / 2;
        const innerRadius = definition.innerDiameter / 2;
        const waves = definition.waves + 0.5; // so waves are not the same with each turn
        var turns = definition.turns;

        if (turns % 2 == 0) // if it's an even number of turns
            turns = turns - (0.5 / waves); //shorten by half a wave

        // The height of the spring is approximately given by:
        // H = freeHeight * (maxT - minT) + 2 * waveHeight + thickness
        // waveHeight = (freeHeight / turns - thickness) / 2 - 0.05 * thickness
        // maxT ~= 1 - 1 / (turns * waves * 2)
        // minT ~= 1 / (turns * waves * 2)
        // So: H = freeHeight * (1 - 1 / (turns * waves)) + (freeHeight / turns - thickness) - 0.1 * thickness + thickness
        // So: H = freeHeight * (1 - 1 / (turns * waves) + 1 / turns) - 0.1 * thickness
        const clearance = 0.02; // arbitrary small number to prevent self intersecting body
        const freeHeight = (definition.freeHeight + clearance * 2 * definition.thickness) / (1 - 1 / (waves * turns) + 1 / turns);
        const waveHeight = (freeHeight / turns - definition.thickness) / 2 - clearance * definition.thickness;

        for (var t = 0; t <= 1 + 1e-8; t += (1 / (60 * turns)))
        {
            var angle = 2 * PI * t * radian * turns;
            outerPoints = append(outerPoints, vector(outerRadius * cos(angle), outerRadius * sin(angle), waveHeight * cos(waves * angle) + freeHeight * t));
            innerPoints = append(innerPoints, vector(innerRadius * cos(angle), innerRadius * sin(angle), waveHeight * cos(waves * angle) + freeHeight * t));
        }

        // create outer and inner 3D splines
        opFitSpline(context, id + "fitSpline1", {
                    "points" : outerPoints
                });
        opFitSpline(context, id + "fitSpline2", {
                    "points" : innerPoints
                });

        // loft between them
        opLoft(context, id + "loft1", {
                    "profileSubqueries" : [qCreatedBy(id + "fitSpline1", EntityType.EDGE), qCreatedBy(id + "fitSpline2", EntityType.EDGE)],
                    "bodyType" : ToolBodyType.SURFACE
                });

        // then thicken
        opThicken(context, id + "thicken1", {
                    "entities" : qCreatedBy(id + "loft1", EntityType.FACE),
                    "thickness1" : 0 * meter,
                    "thickness2" : definition.thickness
                });

        // Make bottom of spring coincident with top plane
        const springBox = evBox3d(context, { "topology" : qCreatedBy(id + "thicken1", EntityType.BODY) });
        const transformVector = vector(0 * meter, 0 * meter, -springBox.minCorner[2]);
        const transformMatrix = transform(transformVector);

        opTransform(context, id + "transform1", {
                    "bodies" : qCreatedBy(id + "thicken1", EntityType.BODY),
                    "transform" : transformMatrix
                });

        // Add mate connectors top and bottom for easy assembly
        opMateConnector(context, id + "mateConnector1", {
                    "coordSystem" : coordSystem(vector(0, 0, 0), vector(1, 0, 0), vector(0, 0, -1)),
                    "owner" : qCreatedBy(id + "thicken1", EntityType.BODY)
                });
        opMateConnector(context, id + "mateConnector2", {
                    "coordSystem" : coordSystem(vector(0, 0, springBox.maxCorner[2] - springBox.minCorner[2]), vector(1, 0, 0), vector(0, 0, 1)),
                    "owner" : qCreatedBy(id + "thicken1", EntityType.BODY)
                });

        // Delete splines and surface
        var bodies = [qCreatedBy(id + "fitSpline1"), qCreatedBy(id + "fitSpline2"), qCreatedBy(id + "loft1")];
        opDeleteBodies(context, id + "delete", { "entities" : qUnion(bodies) });

    }, { /* default parameters */ });

const NUM_TURNS =
{
            "min" : 3,
            "max" : 1e9,
            (unitless) : [3, 7, 1e5]
        } as IntegerBoundSpec;

const NUM_WAVES =
{
            "min" : 2,
            "max" : 1e9,
            (unitless) : [2, 5, 1e5]
        } as IntegerBoundSpec;

const INSIDE_DIA =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [1e-5, 0.02, 500],
            (centimeter) : 2.0,
            (millimeter) : 20.0,
            (inch) : 0.8
        } as LengthBoundSpec;

const THICKNESS =
{
            "min" : -TOLERANCE.zeroLength * meter,
            "max" : 500 * meter,
            (meter) : [1e-5, 0.0005, 500],
            (centimeter) : 0.05,
            (millimeter) : 0.5,
            (inch) : 0.02
        } as LengthBoundSpec;

