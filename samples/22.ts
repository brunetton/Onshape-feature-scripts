// https://cad.onshape.com/documents/ae242486af63d55695d994a6/w/bd934a52d0bc030cc75b310f/e/29d9d90c9bbc99f664e94d53

/*
    O-Rings

    This custom feature creates a O-Ring model that can fit onto an internal groove or an external groove.

    Version 1 - June 25, 2016 - Lau Hong Jin
*/

FeatureScript 369;
import(path : "onshape/std/geometry.fs", version : "369.0");

export const ORING_INNER_DIAMETER_LENGTH_BOUNDS =
{
            "min" : 0.010 * inch,
            "max" : 30 * inch,
            (inch) : [0.010, 2, 30],
            (meter) : 0.05,
            (centimeter) : 5,
            (millimeter) : 50,
            (foot) : 0.17,
            (yard) : 0.06
        } as LengthBoundSpec;

export const ORING_PROFILE_DIAMETER_LENGTH_BOUNDS =
{
            "min" : 0.010 * inch,
            "max" : 1 * inch,
            (inch) : [0.010, 0.25, 1],
            (meter) : 0.006,
            (centimeter) : 0.635,
            (millimeter) : 50,
            (foot) : 6.35,
            (yard) : 0.007
        } as LengthBoundSpec;

export const ORING_SQUEEZE_PERCENT_BOUNDS =
{
            "min" : 0,
            "max" : 60,
            (unitless) : [0, 5, 60]
        } as RealBoundSpec;

export enum oRingType
{
    annotation { "Name" : "External O-Ring" }
    EXTERNAL,
    annotation { "Name" : "Internal O-Ring" }
    INTERNAL
}


annotation { "Feature Type Name" : "O ring" }
export const oRing = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Internal / External" }
        definition.oRingType is oRingType;

        annotation { "Name" : "Grooves or Bores", "Filter" : GeometryType.CYLINDER }
        definition.groovesBores is Query;

        annotation { "Name" : "Seat O-Ring" }
        definition.seatOring is boolean;

        if (definition.seatOring == false)
        {
            annotation { "Name" : "O-Ring ID" }
            isLength(definition.oRingID, ORING_INNER_DIAMETER_LENGTH_BOUNDS);
        }

        annotation { "Name" : "Squeeze O-Ring" }
        definition.squeezeOring is boolean;

        if (definition.squeezeOring)
        {
            annotation { "Name" : "Percentage O-ring Squeeze (%)" }
            isReal(definition.oRingSqueeze, ORING_SQUEEZE_PERCENT_BOUNDS);
        }

        annotation { "Name" : "O-Ring Profile Diameter" }
        isLength(definition.oRingProfileDia, ORING_PROFILE_DIAMETER_LENGTH_BOUNDS);

    }
    {

        var groovesBores = evaluateQuery(context, definition.groovesBores); // returns CYLINDERs, either cylindrical groove or cylindrial bore
        var counter = 1; // counter to identify separate profile sketches, to avoid duplicate sketches

        for (var grooveBore in groovesBores)
        {
            // Create a coordinate system for sketching the O-ring profile
            var oRingAxis is Line = evAxis(context, { "axis" : grooveBore });  // axis for revolving
            var grooveBoreRad is ValueWithUnits = evSurfaceDefinition(context, { "face" : grooveBore }).radius;
            var xDirection is Vector = oRingAxis.direction;
            var zDirection is Vector = perpendicularVector(oRingAxis.direction);
            var cSys is CoordSystem = coordSystem(oRingAxis.origin, xDirection, zDirection);

            // O-ring profile position varies depending on its type (internal or external), squeezed or free, seated or not seated
            var ExternalSeatedSqueezed is Vector = vector(0, (grooveBoreRad + (1 - definition.oRingSqueeze / 100) * (definition.oRingProfileDia / 2)) / inch) * inch; //external & seated & squeezed
            var ExternalSeatedFree is Vector = vector(0, (grooveBoreRad + (definition.oRingProfileDia/2)) / inch) * inch; //external & seated but not squeezed (free)
            var InternalSeatedSqueezed is Vector = vector(0, (grooveBoreRad - (1 - definition.oRingSqueeze / 100) * (definition.oRingProfileDia / 2)) / inch) * inch; //internal & seated & squeezed
            var InternalSeatedFree is Vector = vector(0, (grooveBoreRad - (definition.oRingProfileDia/2)) / inch) * inch; //internal & seated but not squeezed
            var InternalExternalSqueezedFree is vector = vector(0, definition.oRingID/2 / inch) * inch; //internal OR external, free (not seated), squeezed OR not squeezed

            // O-ring cross-sectional profile is defined by an ellipse sketch
            var majRadSqueezed is ValueWithUnits = (1 + definition.oRingSqueeze / 100) * (definition.oRingProfileDia / 2); // O-ring squeezed -> ellipse's major radius increased
            var minRadSqueezed is ValueWithUnits = (1 - definition.oRingSqueeze / 100) * (definition.oRingProfileDia / 2); // O-ring squeezed -> ellipse's minor radius decreased
            var majRadFree is ValueWithUnits = (definition.oRingProfileDia / 2); // O-ring at free state -> ellipse's major radius = circular profile radius
            var minRadFree is ValueWithUnits = (definition.oRingProfileDia / 2); // O-ring at free state -> ellipse's minor radius = circular profile radius

            // Initialize profile position & dimension to O-ring at free state
            var profilePosition is Vector = InternalExternalSqueezedFree;
            var majRad is ValueWithUnits = majRadFree;
            var minRad is ValueWithUnits = minRadFree;

            // Vary profile position & dimension according to whether O-ring is (External or Internal), (seated or not seated) and (squeezed or free)
            if (definition.oRingType == oRingType.EXTERNAL)
            {
                if (definition.seatOring)
                {
                    if (definition.squeezeOring)
                    {
                        profilePosition = ExternalSeatedSqueezed;
                        majRad = majRadSqueezed;
                        minRad = minRadSqueezed;
                    }
                    else
                    {
                        profilePosition = ExternalSeatedFree;
                    }
                }
            }
            else
            {
                if (definition.seatOring)
                {
                    if (definition.squeezeOring)
                    {
                        profilePosition = InternalSeatedSqueezed;
                        majRad = majRadSqueezed;
                        minRad = minRadSqueezed;
                    }
                    else
                    {
                        profilePosition = InternalSeatedFree;
                    }
                }
            }

            // create O-ring using determined profile position & dimension
            createOring(context, id + ("o-ring" ~ counter), cSys, profilePosition, majRad, minRad, oRingAxis);
            counter += 1;

        }
    });


function createOring(context, id, cSys, profilePosition, majRad, minRad, oRingAxis)
{

    var profilePlane = plane(cSys);
    var profileSketchId = id + "profileSketch";
    var profileSketch = newSketchOnPlane(context, profileSketchId, { "sketchPlane" : profilePlane });

    skEllipse(profileSketch, "ellipse1", {
                "center" : profilePosition,
                "majorRadius" : majRad,
                "minorRadius" : minRad
            });

    skSolve(profileSketch);

    opRevolve(context, id + "revolve1", {
                "entities" : qSketchRegion(profileSketchId),
                "axis" : oRingAxis,
                "angleForward" : 360 * degree
            });

     opDeleteBodies(context, id + "deleteBodies", {
            "entities" : qCreatedBy(profileSketchId)
    });

}
