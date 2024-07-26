// https://cad.onshape.com/documents/cfcc264d41817d876589755c/w/96f5dc1940f48d057e52bdaa/e/292004f306ed436c76be47eb

FeatureScript 1420;

import(path : "onshape/std/attributes.fs", version : "1420.0");
import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/coordSystem.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/properties.fs", version : "1420.0");
import(path : "onshape/std/topologyUtils.fs", version : "1420.0");
import(path : "onshape/std/units.fs", version : "1420.0");

export import(path : "6fb34667b55a246e198a34ad", version : "c67f4998909bab6f0689030f");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

/**
 * Attribute type for beams.
 *
 * This is set by `setBeamAttributes`
 */
export type BeamAttribute typecheck canBeBeamAttribute;

export predicate canBeBeamAttribute(value)
{
    value is map;
    value.isBeam == true;

    value.profile == undefined || value.profile is BeamProfile || canBeBeamProfile(value.profile);

    value.lengthEdges is array;
    value.lengthFaces is Query;
    value.originalLength == undefined || value.originalLength is ValueWithUnits;

    value.endFaces == undefined || value.endFaces is Query;

    value.weldGap == undefined || value.weldGap is number;
    value.id == undefined || value.id is Id;
    value.originalPart == undefined || value.originalPart is Query;
    value.canUseBBox is boolean;

    value.profileCSys == undefined || value.profileCSys is CoordSystem;
    // This is not very resiliant to transforms, etc, but it is used for the attached beams.
}

/**
 * Gets a beam attribute.
 * Returns `undefined` if the `Query` does not resolve to a beam.
 * Alternatively throws an error if it is a derived beam from another part studio.
 */
export function getPossibleBeamAttribute(context is Context, beam is Query)
{
    var att = context->getInternalBeamAttribute(beam);
    if (att == undefined)
        return undefined;

    att.lengthEdges = att.lengthEdges->mapArray(function(q)
        {
            const evQ = try silent(context->evaluateQuery(q->qOwnedByBody(beam))->qUnion());
            if (evQ == undefined)
                throw regenError("Cannot use a derived beam.", beam);
            return evQ;
        });

    // We use evaluateQuery so that we can test whether it will work
    att.lengthFaces = try silent(context->evaluateQuery(att.lengthFaces->qOwnedByBody(beam))->qUnion());
    if (att.lengthFaces == undefined)
        throw regenError("Cannot use a derived beam.", beam);

    if (att.endFaces is Query)
    {
        att.endFaces = try silent(context->evaluateQuery(att.endFaces->qOwnedByBody(beam))->qUnion());
        if (att.endFaces == undefined)
            throw regenError("Cannot use a derived beam.", beam);
    }
    return att;
}

/**
 * Gets a beam attribute.
 * Throws an error if the `Query` is not a beam, or it is a derived beam from another part studio.
 */
export function getBeamAttribute(context is Context, beam is Query) returns BeamAttribute
{
    const att = context->getPossibleBeamAttribute(beam);
    if (att == undefined)
        throw regenError("Part is not a beam.", beam);

    return att;
}

/**
 * Gets the profile of a beam
 * Throws an error if it is not a beam, or it is a derived beam, or if there is no usable profile.
 */
export function getBeamProfile(context is Context, beam is Query) returns BeamProfile
{
    const att = context->getInternalBeamAttribute(beam);
    if (att == undefined)
        throw regenError("Part is not a beam.", beam);
    else if (att.profile == undefined)
        throw regenError("Beam cannot be used for profile.", beam);

    return att.profile as BeamProfile;
}

/**
 * Gets the end faces of beams.
 * This should never throw an error
 */
export function getEndFaces(context is Context, beamsQ is Query) returns Query
{
    var faces is Query = emptyQ;
    const beams is array = context->evaluateQuery(beamsQ);
    for (var beam in beams)
    {
        const att = context->getInternalBeamAttribute(beam);
        if (att is BeamAttribute && att.endFaces is Query)
        {
            const endFaces = try silent(context->evaluateQuery(att.endFaces->qOwnedByBody(beam)));
            if (endFaces != undefined)
                faces += endFaces->qUnion();
        }
    }
    return faces;
}

// This is defined as a separate function so that the derive check is not performed when getting a beam profile.
function getInternalBeamAttribute(context is Context, beam is Query)
{
    // This is to support attributes that do not have the same BeamAttribute tag
    // This will hopefully be able to support beams from Neil's feature if he adds attributes to them.
    const atts is array = context->getAttributes({ "entities" : beam })->filter(function(value)
        {
            return value->canBeBeamAttribute();
        });

    if (@size(atts) == 0)
        return undefined;

    return atts[0] as BeamAttribute;
}

function setInternalBeamAttribute(context is Context, id is Id, definition is map)
precondition
{
    definition.beam is Query;
    definition.lengthEdges is array;
    definition.lengthFaces is Query;
    definition.profile is BeamProfile;
    definition.weldGap is number;
    definition.canUseBBox is boolean;
    definition.originalLength == undefined || definition.originalLength is ValueWithUnits;
    definition.profileCSys == undefined || definition.profileCSys is CoordSystem;
    definition.endFaces == undefined || definition.endFaces is Query;
}
{
    const beam is Query = definition.beam;
    const prevAttribute = context->getInternalBeamAttribute(beam);
    if (prevAttribute != undefined)
        context->removeAttributes({
                    "entities" : beam,
                    "attributePattern" : prevAttribute
                });
    context->setAttribute({
                "entities" : beam,
                "attribute" : {
                            // "curve" : context->evCurveDefinition( { "edge" : edge }),
                            "id" : id,
                            "lengthEdges" : definition.lengthEdges,
                            "lengthFaces" : definition.lengthFaces,
                            "profile" : definition.profile,
                            "originalPart" : context->makeRobustQuery(context->evaluateQuery(beam)->qUnion()),
                            "weldGap" : definition.weldGap,
                            "canUseBBox" : definition.canUseBBox,
                            "originalLength" : definition.originalLength,
                            "profileCSys" : definition.profileCSys,
                            "endFaces" : definition.endFaces,
                            "isBeam" : true
                        } as BeamAttribute
            });

    if (definition.profile.material is Material)
        context->setProperty({
                    "entities" : beam,
                    "propertyType" : PropertyType.MATERIAL,
                    "value" : definition.profile.material
                });

    if (definition.profile.colour is Color)
        context->setProperty({
                    "entities" : beam,
                    "propertyType" : PropertyType.APPEARANCE,
                    "value" : definition.profile.colour
                });

    if (definition.profile.partNumber is string)
        context->setProperty({
                    "entities" : beam,
                    "propertyType" : PropertyType.PART_NUMBER,
                    "value" : definition.profile.partNumber
                });
}

/**
 * Sets beam attributes on beams.
 * Removes all beam attributes previously on the beams.
 */
export function setBeamAttributes(context is Context, id is Id, definition is map)
precondition
{
    definition.beams is Query || definition.beam is Query;
    definition.lengthEdges is array || definition.lengthEdges is Query;
    definition.lengthFaces is Query;
    definition.profile is BeamProfile;
    definition.weldGap is number;
    definition.canUseBBox is boolean;
    definition.originalLength == undefined || definition.originalLength is ValueWithUnits;
    definition.profileCSys == undefined || definition.profileCSys is CoordSystem;
    definition.endFaces == undefined || definition.endFaces is Query;
}
{
    if (definition.lengthEdges is array)
        definition.lengthEdges = definition.lengthEdges->qUnion();
    const lengthEdges is Query = definition.lengthEdges;
    const lengthFaces is Query = definition.lengthFaces;
    const endFaces = definition.endFaces;
    const beams is array = context->evaluateQuery(definition.beams is Query ? definition.beams : definition.beam);
    definition.beams = undefined;
    for (var part in beams)
    {
        definition.lengthEdges = context->connectedComponents(lengthEdges->qOwnedByBody(part), AdjacencyType.VERTEX)->mapArray(
                function(component is array) returns Query
            {
                return component->qUnion() + context->startTracking(component->qUnion());
            });

        definition.lengthFaces = context->evaluateQuery(lengthFaces->qOwnedByBody(part))->mapArray(function(q is Query) returns Query
                {
                    return q + context->startTracking(q);
                })->qUnion();

        if (endFaces != undefined)
            definition.endFaces = context->evaluateQuery(endFaces->qOwnedByBody(part))->mapArray(
                        function(q is Query) returns Query
                    {
                        return q + context->startTracking(q);
                    })->qUnion();

        definition.beam = part;
        context->setInternalBeamAttribute(id, definition);
    }
}


FeatureScript 1420;

import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/context.fs", version : "1420.0");
import(path : "onshape/std/coordSystem.fs", version : "1420.0");
import(path : "onshape/std/error.fs", version : "1420.0");
import(path : "onshape/std/evaluate.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/manipulator.fs", version : "1420.0");
import(path : "onshape/std/query.fs", version : "1420.0");
import(path : "onshape/std/transform.fs", version : "1420.0");
import(path : "onshape/std/curveGeometry.fs", version : "1420.0");
import(path : "onshape/std/units.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");

import(path : "292004f306ed436c76be47eb", version : "316705980497e6732a50d563");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");
import(path : "1fc98b5b3ebd3fe07e6f3aa4", version : "40390332fd972f5803a2e6fb");

/**
 * This is the internal function to create attached beams.
 */
export function createAttachedBeam(context is Context, id is Id, definition is map)
precondition
{
    definition.profile is Query;
    definition.profileData is BeamProfile;
    definition.profilePoint is number;
    definition.profileManip is boolean;
    definition.profileRotation is ValueWithUnits;
    definition.profileOffsetX is ValueWithUnits;
    definition.profileOffsetY is ValueWithUnits;

    definition.endOffset1 is ValueWithUnits;
    definition.endOffset2 is ValueWithUnits;

    definition.attached is Query;
    definition.attachedPoint is number;
    definition.attachedManip is boolean;

    definition.toDelete is box;
}
{
    const toDelete is box = definition.toDelete;

    const attachedAttribute is BeamAttribute = context->getBeamAttribute(definition.attached);
    if (attachedAttribute.canUseBBox != true)
        throw regenError("Can only attach on a single straight beam.", ["beam"], definition.attached);

    var profileCSys is CoordSystem = attachedAttribute.profileCSys;

    // All we want to do is flip the x axis and keep the y axis the same. To do that, we need to flip the z axis, otherwise it goes wron, since coordsystems have a handedness.
    if (definition.flipped)
    {
        profileCSys.xAxis *= -1;
        profileCSys.zAxis *= -1;
    }
    const bBox is Box3d = context->evBox3d({
                "topology" : definition.attached,
                "tight" : true,
                "cSys" : profileCSys
            });

    const length is ValueWithUnits = bBox.maxCorner[2] - bBox.minCorner[2];
    profileCSys.origin += profileCSys.zAxis * (bBox.maxCorner[2] + bBox.minCorner[2]) / 2;

    if (attachedAttribute.profile.extraOriginPoints is array && definition.attachedManip)
        context->addManipulators(id, {
                    "attachedPoints" : pointsManipulator({
                                "points" : getAttachedProfileOrigins(attachedAttribute.profile, profileCSys->toWorld()),
                                "index" : definition.attachedPoint >= @size(attachedAttribute.profile.extraOriginPoints) ? 0 : definition.attachedPoint + 1
                            })
                });

    const attachedOffset is Vector = getAttachedProfileOffset(attachedAttribute.profile, definition.attachedPoint);

    profileCSys.origin += profileCSys.xAxis * attachedOffset[0] + yAxis(profileCSys) * attachedOffset[1];

    const rotT is Transform = Z_AXIS->rotationAround(definition.profileRotation);

    if (definition.profileData.extraOriginPoints is array && definition.profileManip)
        context->addManipulators(id, {
                    "points" : pointsManipulator({
                                "points" : getProfileOrigins(
                                        definition.profileData,
                                        definition.profilePoint,
                                        profileCSys->toWorld() * rotT
                                        * vector(definition.profileOffsetX, definition.profileOffsetY, 0 * meter)->transform()
                                    ),
                                "index" : definition.profilePoint >= @size(definition.profileData.extraOriginPoints) ? 0 : definition.profilePoint + 1
                            })
                });

    var profileQ is Query = context->startTracking(definition.profile);

    context->opPattern(id + "profile", {
                "entities" : definition.profile->qOwnerBody(),
                "transforms" : [toWorld(profileCSys) * rotT],
                "instanceNames" : ["1"]
            });
    toDelete[] += qCreatedBy(id + "profile", EntityType.BODY);

    profileQ = context->evaluateQuery(profileQ)->qUnion();

    const extrudeTracking is Query = context->startTracking(profileQ->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX))->qEntityFilter(EntityType.EDGE);

    context->opExtrude(id + "extrude", {
                "entities" : profileQ,
                "direction" : profileCSys.zAxis,
                "endBound" : BoundingType.BLIND,
                "endDepth" : length / 2 - definition.endOffset1,
                "startBound" : BoundingType.BLIND,
                "startDepth" : length / 2 - definition.endOffset2
            });

    const extrudeSideFaces is Query = context->evaluateQuery(qNonCapEntity(id + "extrude", EntityType.FACE))->mapArray(function(q is Query) returns Query
            {
                return q + context->startTracking(q);
            })->qUnion();

    // Set attributes for cutlist
    context->setBeamAttributes(id, {
                "beams" : qCreatedBy(id + "extrude", EntityType.BODY),
                "lengthEdges" : context->evaluateQuery(extrudeTracking)->qUnion(),
                "lengthFaces" : extrudeSideFaces,
                "profile" : definition.profileData,
                "weldGap" : 0,
                "canUseBBox" : true,
                "originalLength" : length,
                "profileCSys" : getProfileCSys(
                        definition.profileData,
                        definition.profilePoint,
                        profileCSys->toWorld()
                    ),
                "endFaces" : qCapEntity(id + "extrude", CapType.EITHER, EntityType.FACE)
            });
}

function getAttachedProfileOrigins(profile is BeamProfile, t is Transform) returns array
{
    const extraOrigins is array = profile.extraOriginPoints;
    const units is ValueWithUnits = profile.units;
    var out is array = [t.translation];
    for (var i = 0; i < @size(extraOrigins); i += 1)
    {
        const extraOriginPoint = extraOrigins[i];
        out = out->append(t *
                (vector(extraOriginPoint[0],
                                profile.flipped ? -extraOriginPoint[1] : extraOriginPoint[1],
                                0) * units));
    }
    return out;
}

function getAttachedProfileOffset(profile is BeamProfile, selectedOrigin is number) returns Vector
{
    const extraOrigins = profile.extraOriginPoints;
    return ((selectedOrigin < 0 || !(extraOrigins is array) || selectedOrigin >= @size(extraOrigins))
                ? vector(0, 0, 0)
                : vector(extraOrigins[selectedOrigin][0], profile.flipped ? -extraOrigins[selectedOrigin][1] : extraOrigins[selectedOrigin][1], 0))
        * profile.units;
}

export function updateDefinitionForManip(context is Context, definition is map, key is string, manip is map) returns map
{
    if (key == "attachedPoints")
        definition.attachedProfileOriginPoint = manip.index - 1;
    else if (key == "points")
        definition.profileOriginPoint = manip.index - 1;
    return definition;
}


FeatureScript 1420;

import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/coordSystem.fs", version : "1420.0");
import(path : "onshape/std/curveGeometry.fs", version : "1420.0");
import(path : "onshape/std/evaluate.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/math.fs", version : "1420.0");
import(path : "onshape/std/properties.fs", version : "1420.0");
import(path : "onshape/std/string.fs", version : "1420.0");
import(path : "onshape/std/surfaceGeometry.fs", version : "1420.0");
import(path : "onshape/std/topologyUtils.fs", version : "1420.0");
import(path : "onshape/std/valueBounds.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");

import(path : "292004f306ed436c76be47eb", version : "316705980497e6732a50d563");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

export function getCutlist(context is Context, parts is Query) returns array
{
    // Get a cutlist
    return context->getCutlist(parts, true, false, false);
}

/**
 * This function gets a cutlist from a [Context] and some parts.
 * When `useGetProperty` is set to `true`, it uses the [getProperty] function to check that the measured angles are the same as the property.
 * This will not work in normal features.
 */
export function getCutlist(context is Context, parts is Query, mergeAndSort is boolean, getEndAngles is boolean, useGetProperty is boolean) returns array
{
    const beams is array = context->evaluateQuery(parts);
    var beamsCutlist is array = context->getCutlistData(beams, useGetProperty, getEndAngles);
    if (mergeAndSort)
    {
        beamsCutlist = context->mergeQuantity(beamsCutlist);
        beamsCutlist = beamsCutlist->sort(function(a is map, b is map)
            {
                const result = a.length - b.length;
                if (tolerantEquals(result, 0 * meter))
                {
                    if (a.approximation == b.approximation)
                        return 0;
                    return a.approximation ? 1 : -1;
                }
                return result;
            });
    }
    return beamsCutlist;
}

export const DP is number = 2;

// TODO: Better bent lengths.
// If I wait until Onshape releases its feature, then I can see what they use. Solidworks uses the original line,
// but I can't do that without having an annoying curve everywhere.

// TODO: Bent CHS true calculation.
// This is currently done just using the original edge length, which is not very reliable. Solidworks also seems to use
// the original line, but I think they project it to it and then measure the length along it, but see the comment above.

// TODO: End angles for bent beams. - These are not done at all, since there is no direction to go off for them.
// Look at how Solidworks does it maybe.
function getCutlistData(context is Context, beams is array, getEndAngleAtts is boolean, getEndAngles is boolean) returns array
{
    var out is array = [];
    for (var beam in beams)
    {
        const att = try silent(context->getPossibleBeamAttribute(beam));
        if (att == undefined)
            continue;

        var length is ValueWithUnits = att.originalLength != undefined ? att.originalLength : 0 * meter;

        var angles is array = [];

        const direction = try silent(context->extractDirection(
                    (att.lengthEdges->qUnion()->qGeometry(GeometryType.LINE) +
                            att.lengthFaces->qGeometry(GeometryType.CYLINDER))->qNthElement(0)
                ));
        const bBoxCSys = att.canUseBBox == true && direction is Vector ?
            coordSystem(WORLD_ORIGIN, direction->perpendicularVector(), direction) :
            undefined;


        /*
           I am using a bounding box to get the length if it can be used, as
           it is more robust and accurate than other methods, such as
           measuring edges along the length.

           A CoordSystem to measure with is created from one of the lengthEdges
           or lengthFaces with its z-axis pointing along the beam.
         */
        if (bBoxCSys is CoordSystem)
        {
            const box3d is Box3d = context->evBox3d({
                        "topology" : beam,
                        "tight" : true,
                        "cSys" : bBoxCSys
                    });
            length = box3d.maxCorner[2] - box3d.minCorner[2];
            if (getEndAngles)
            {
                const allEndFaces is Query = context->getEndFaces(beam);

                // We only use planes, cylinders and tori for the end faces.
                // TODO: What other faces can we accept as end faces.
                const endFaces is Query = allEndFaces->qGeometry(GeometryType.PLANE) +
                    allEndFaces->qGeometry(GeometryType.CYLINDER) +
                    allEndFaces->qGeometry(GeometryType.TORUS);
                const faces1 is array = context->evaluateQuery(endFaces->qFarthestAlong(bBoxCSys.zAxis)); // We choose the face that is the least angle out of these
                const faces2 is array = context->evaluateQuery(endFaces->qFarthestAlong(-bBoxCSys.zAxis));
                // First angle
                var angle1 is number = 90;
                for (var face in faces1)
                {
                    const angleTest is number = angleBetween(
                                context->evFaceTangentPlane({
                                            "face" : face,
                                            "parameter" : vector(0.5, 0.5)
                                        }).normal,
                                bBoxCSys.zAxis) / degree;
                    if (angleTest < angle1)
                        angle1 = angleTest;
                }
                angle1 = 90 - angle1;
                // Second angle
                var angle2 is number = 90;
                for (var face in faces2)
                {
                    const angleTest is number = angleBetween(
                                context->evFaceTangentPlane({
                                            "face" : face,
                                            "parameter" : vector(0.5, 0.5)
                                        }).normal,
                                -bBoxCSys.zAxis) / degree;
                    if (angleTest < angle2)
                        angle2 = angleTest;
                }
                angle2 = 90 - angle2;

                if (angle2 < angle1)
                    angles = [angle2, angle1];
                else
                    angles = [angle1, angle2];
            }
        }
        else
            length = context->getLength(att.lengthEdges, beam, length);

        var anglesOverridden is array = [undefined, undefined];
        if (getEndAngleAtts)
            try
            {
                var newAngles is array = [
                    context->getPropertyNumber(beam, cpAngle1Ids, 90),
                    context->getPropertyNumber(beam, cpAngle2Ids, 90)
                ];
                if (newAngles[1] < newAngles[0])
                    newAngles = [newAngles[1], newAngles[0]];

                if (angles == [])
                    angles = newAngles;

                else
                {
                    const newAngle0 is number = newAngles[0]->roundToPrecision(DP);
                    const newAngle1 is number = newAngles[1]->roundToPrecision(DP);

                    const angle0 is number = angles[0]->roundToPrecision(DP);
                    const angle1 is number = angles[1]->roundToPrecision(DP);

                    // We don't want to override the measured angles if the properties weren't set
                    if (newAngle0 != 90 && newAngle1 != 90 && (angle0 != newAngle0 || angle1 != newAngle1))
                    {
                        // Separate overrides for each.
                        anglesOverridden = [
                                angle0 != newAngle0 ? newAngle0 : undefined,
                                angle1 != newAngle1 ? newAngle1 : undefined
                            ];
                        angles = newAngles;
                    }
                }
            }
        else if (angles == [])
            angles = [90, 90];

        const lengthInMM is number = round(length / millimeter);
        if (!tolerantEquals(length, 0 * meter))
            out = append(out, {
                        "length" : lengthInMM * millimeter,
                        "beam" : beam,
                        "profile" : att.profile.name,
                        "quantity" : 1,
                        "approximation" : !(bBoxCSys is CoordSystem), // If it was a cSys, we measured using it
                        "formattedLength" : lengthInMM ~ " mm" ~ (bBoxCSys is CoordSystem ? "" : "*"), // same here
                        "angles" : angles,
                        "anglesOverridden" : anglesOverridden
                    });
    }
    return out;
}

function mergeQuantity(context is Context, cutlist is array) returns array
{
    const partVolumes = new box({}); // Map from evaluated item to volume
    var quantities = [];
    for (var beamData in cutlist)
    {
        var i = 0;
        for ( ; i < @size(quantities); i += 1)
        {
            const qtyData = quantities[i];
            if (qtyData.profile == beamData.profile &&
                tolerantEquals(qtyData.length, beamData.length) &&
                qtyData.approximation == beamData.approximation && // We don't want to contaminate everything with an approximation
                checkEndAngles(quantities[i].angles, beamData.angles) && // Make sure the end angles are set to the same
                context->checkPartGeometry(qNthElement(qtyData.beam, 0), beamData.beam, partVolumes)) // Make sure the parts are the same shape
            {
                quantities[i].quantity += 1;
                quantities[i].beam += beamData.beam;
                break;
            }
        }
        if (i >= @size(quantities)) // No match
            quantities = quantities->append(beamData);
    }
    return quantities;
}

// TODO: This function should check the part geometry to see if it is the same.
// Currently it only checks if the volume and no. of faces are the same, which doesn't work for mirrored parts.
function checkPartGeometry(context is Context, part0 is Query, part1 is Query, partData is box) returns boolean
{
    const data0 = context->getPartData(part0, partData);
    const data1 = context->getPartData(part1, partData);
    if (!tolerantEquals(data0.volume, data1.volume) || data0.faces != data1.faces)
        return false;
    return true;
}

function getPartData(context is Context, partQ is Query, partData is box) returns map
{
    const part = context->evaluateQuery(partQ)[0];
    var partDataPart = partData[][part];
    if (partDataPart == undefined)
    {
        partDataPart = {
                "volume" : context->evVolume({ "entities" : part }),
                "faces" : context->evaluateQuery(part->qOwnedByBody(EntityType.FACE))->size()
            };
        partData[][part] = partDataPart;
    }
    return partDataPart;
}

predicate checkEndAngles(set1 is array, set2 is array)
{
    tolerantEquals(set1[0] * degree, set2[0] * degree);
    tolerantEquals(set1[1] * degree, set2[1] * degree);
}

// Returns fallBackLength if no length can be calculated.
function getLength(context is Context, edgeArr is array, beam is Query, fallBackLength is ValueWithUnits) returns ValueWithUnits
{
    const out = edgeArr->mapArray(function(edges)
            {
                return context->evLength({ "entities" : edges });
            })->max();
    if (out is ValueWithUnits)
        return out;
    return fallBackLength;
}

FeatureScript 1420;

import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/coordSystem.fs", version : "1420.0");
import(path : "onshape/std/curveGeometry.fs", version : "1420.0");
import(path : "onshape/std/evaluate.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/manipulator.fs", version : "1420.0");
import(path : "onshape/std/path.fs", version : "1420.0");
import(path : "onshape/std/string.fs", version : "1420.0");
import(path : "onshape/std/surfaceGeometry.fs", version : "1420.0");
import(path : "onshape/std/transform.fs", version : "1420.0");
import(path : "onshape/std/units.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");
import(path : "onshape/std/debug.fs", version : "1420.0");

import(path : "onshape/std/booleanoperationtype.gen.fs", version : "1420.0");

import(path : "292004f306ed436c76be47eb", version : "316705980497e6732a50d563");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");
import(path : "1fc98b5b3ebd3fe07e6f3aa4", version : "40390332fd972f5803a2e6fb");

export function createBeamAlongPath(context is Context, id is Id, definition is map) returns Query
precondition
{
    definition.loop is map;

    // The profile to extrude or sweep along the path
    definition.profile is Query;
    // The profileData. It is used for manipulators and the BeamAttributes.
    definition.profileData is BeamProfile;
    // This is used for calculating how many faces a trimmed part could have.
    definition.profileEdgeCount is number;

    definition.trimFaces is Query;
    definition.trimParts is Query;

    definition.profileOriginPoint is number;
    definition.offsetX is ValueWithUnits;
    definition.offsetY is ValueWithUnits;

    definition.addManipulators is boolean;
    // This is used to add the manipulators to the right id.
    definition.topId is Id;

    definition.weldGap is ValueWithUnits;

    // These two are used to populate information about the end faces, so joints can be made correctly.
    definition.endFaceMap is box;
    definition.endFaceOrder is box;

    definition.toDelete is box;

    // This is the remainderPatternTransform, so beams will work in patterns.
    definition.transform is Transform;
}
{
    // Localise the variables
    const weldGap is ValueWithUnits = definition.weldGap;

    const endFaceMap is box = definition.endFaceMap;
    const endFaceOrder is box = definition.endFaceOrder;

    const toDelete is box = definition.toDelete;

    const remainderTransform is Transform = definition.transform;

    const hasRemainderTransform is boolean = remainderTransform != identityTransform();
    const hasWeldGap is boolean = !tolerantEquals(weldGap, 0 * meter);

    const originalPath is Path = definition.loop.path;
    var transformedPath is Path = originalPath;

    // For working in mirror feature, etc.
    if (hasRemainderTransform)
    {
        transformedPath.edges = context->startTrackingArray(transformedPath.edges);

        context->opPattern(id + "remainderPattern", {
                    "entities" : originalPath.edges->qUnion()->qOwnerBody(),
                    "transforms" : [remainderTransform],
                    "instanceNames" : ["1"]
                });

        toDelete[] += qCreatedBy(id + "remainderPattern");

        transformedPath.edges = context->endTrackingArray(transformedPath.edges);
    }

    const firstEdge is Query = originalPath.edges[0];
    const firstEdgeFlipped is boolean = originalPath.flipped[0];

    // This points in from the start
    var firstEdgeLine is Line = context->evEdgeTangentLine({
            "edge" : firstEdge,
            "parameter" : firstEdgeFlipped ? 1 : 0
        });
    if (firstEdgeFlipped)
        firstEdgeLine.direction *= -1;

    // This points in from the end
    var lastEdgeLine is Line = context->evEdgeTangentLine({
            "edge" : originalPath.edges[@size(originalPath.edges) - 1],
            "parameter" : originalPath.flipped[@size(originalPath.edges) - 1] ? 0 : 1
        });
    if (!originalPath.flipped[@size(originalPath.edges) - 1])
        lastEdgeLine.direction *= -1;

    // We can use extrude if all the edges are lines (the loop has already been checked for tangency)
    const usingExtrude is boolean = @size(context->evaluateQuery(originalPath.edges->qUnion()->qGeometry(GeometryType.LINE))) == @size(originalPath.edges);
    var normal;

    // Work out the plane that the path is on
    if (@size(originalPath.edges) >= 2 && !usingExtrude)
        try silent
        {
            const point0 is Vector = context->evVertexPoint({
                        "vertex" : firstEdge->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX)->qNthElement(0)
                    });
            const point1 is Vector = context->evVertexPoint({
                        "vertex" : firstEdge->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX)->qNthElement(1)
                    });
            const point2 is Vector = context->evVertexPoint({
                        "vertex" : originalPath.flipped[1] ?
                            originalPath.edges[1]->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX)->qNthElement(0) :
                            originalPath.edges[1]->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX)->qNthElement(1)
                    });
            normal = cross(point2 - point0, point1 - point0);
        }

    if (normal == undefined || norm(normal).value < TOLERANCE.zeroLength)
        normal = try silent(context->evOwnerSketchPlane({ "entity" : firstEdge }).normal);

    if (normal == undefined) // Last-effort direction
        normal = perpendicularVector(firstEdgeLine.direction);

    const rotT is Transform = rotationAround(Z_AXIS, definition.loop.rotation);

    const t is Transform = toWorld(coordSystem(firstEdgeLine.origin, -cross(firstEdgeLine.direction, normal), firstEdgeLine.direction)) * rotT;

    // Checking if there is a transform is just a (very) slight performance improvement when patterning (the manipulators don't show up anyway)
    if (definition.addManipulators && !hasRemainderTransform)
    {
        const useMid is boolean = @size(context->evaluateQuery(originalPath.edges[0]->qGeometry(GeometryType.LINE))) == 1;
        const firstEdgeLength is ValueWithUnits = context->evLength({
                    "entities" : originalPath.edges[0]
                });
        const pointsT is Transform = t * transform(vector(definition.offsetX, definition.offsetY, useMid ? firstEdgeLength / 2 : 0 * meter));
        const manipOrigin is Vector = useMid ? firstEdgeLine.origin + firstEdgeLine.direction * firstEdgeLength / 2 : firstEdgeLine.origin;

        const xManipOrigin is Vector = manipOrigin + (t.linear * Y_DIRECTION) * definition.offsetY;
        const yManipOrigin is Vector = manipOrigin + (t.linear * X_DIRECTION) * definition.offsetX;
        context->addManipulators(definition.topId, {
                    "XOffset" : linearManipulator({
                                "base" : xManipOrigin,
                                "direction" : t.linear * X_DIRECTION,
                                "offset" : definition.offsetX,
                                "primaryParameterId" : "offsetX"
                            }),
                    "YOffset" : linearManipulator({
                                "base" : yManipOrigin,
                                "direction" : t.linear * Y_DIRECTION,
                                "offset" : definition.offsetY,
                                "primaryParameterId" : "offsetY"
                            }),
                    "points" : definition.profileData.extraOriginPoints is array
                        ? pointsManipulator({
                                    "points" : getProfileOrigins(definition.profileData, definition.profileOriginPoint, pointsT),
                                    "index" : definition.profileOriginPoint >= @size(definition.profileData.extraOriginPoints) ? 0 : definition.profileOriginPoint + 1
                                })
                        : undefined
                });
    }

    // Profile for sweeping
    var profileQ is Query = context->startTracking(definition.profile);

    // Pattern the profile
    context->opPattern(id + "pattern", {
                "entities" : definition.profile->qOwnerBody(),
                "transforms" : [remainderTransform * t],
                "instanceNames" : ["1"]
            });

    toDelete[] += qCreatedBy(id + "pattern");

    profileQ = context->evaluateQuery(profileQ)->qUnion();

    var sweepTracking is Query = context->startTracking({
                "subquery" : profileQ->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX),
                "secondarySubquery" : transformedPath.edges->qUnion()
            })->qEntityFilter(EntityType.EDGE);

    // Sweep or extrude the profile along the edge
    if (usingExtrude)
    {
        sweepTracking = context->startTracking(profileQ->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX))->qEntityFilter(EntityType.EDGE);
        context->opExtrude(id + "sweep", {
                    "entities" : profileQ,
                    "direction" : normalize(remainderTransform.linear * firstEdgeLine.direction),
                    "endBound" : BoundingType.BLIND,
                    "endDepth" : context->evLength({ "entities" : originalPath.edges->qUnion() })
                });

    }
    else
        context->opSweep(id + "sweep", {
                    "profiles" : profileQ,
                    "path" : transformedPath.edges->qUnion()
                });

    sweepTracking = context->evaluateQuery(sweepTracking)->qUnion();
    sweepTracking += context->startTracking(sweepTracking);

    var sweepBody is Query = qCreatedBy(id + "sweep", EntityType.BODY);

    const sweepSideFaces is Query = context->evaluateQuery(qNonCapEntity(id + "sweep", EntityType.FACE))->mapArray(function(q is Query) returns Query
            {
                return q + context->startTracking(q);
            })->qUnion();

    var facesToMove is Query = emptyQ;
    var facesNonMoved is Query = emptyQ; // Faces that were trimmed, but don't need moving
    var facesToReplace is array = [];

    var trimFaces is Query = definition.trimFaces;
    const hasTrimFaces is boolean = context->evaluateQuery(trimFaces) != [];
    if (hasTrimFaces)
    {
        var bodiesToIntersect is array = [];

        // Check ends if they can be used for replaceFace
        if (!originalPath.closed)
            // This is an easy way to ensure that the ends will be treated the same
            for (var endSet in [
                    [firstEdgeLine, qCapEntity(id + "sweep", CapType.START, EntityType.FACE), "start"],
                    [lastEdgeLine, qCapEntity(id + "sweep", CapType.END, EntityType.FACE), "end"],
                ])
            {
                const endLine is Line = endSet[0];
                const endFace is Query = endSet[1];
                const idSuffix is string = endSet[2];
                const facesToCheck is array = context->evaluateQuery(trimFaces->qGeometry(GeometryType.PLANE)->qClosestTo(endLine.origin));
                if (facesToCheck != [])
                {
                    const distanceResult is map = context->evDistance({
                                "side0" : endLine.origin,
                                "side1" : facesToCheck->qUnion(),
                                "extendSide1" : true
                            });
                    if (tolerantEquals(distanceResult.distance, 0 * meter))
                        try
                        {
                            const face is Query = facesToCheck[distanceResult.sides[1].index];
                            const faceNormal is Vector = context->evPlane({ "face" : face }).normal;
                            const isOpposite is boolean = dot(faceNormal, endLine.direction) > 0;
                            context->opReplaceFace(id + "replaceEnds" + idSuffix, {
                                        "replaceFaces" : endFace,
                                        "templateFace" : face,
                                        "oppositeSense" : isOpposite
                                    });
                            trimFaces -= face;
                            // If it is trimming to a solid entity, it accounts for weld gap
                            if (context->evaluateQuery(face->qBodyType(BodyType.SOLID)) != [])
                                facesToMove += endFace;
                        }
                }
            }

        const toolsFacesSolid is array = context->evaluateQuery(trimFaces->qBodyType(BodyType.SOLID));
        for (var k = 0; k < @size(toolsFacesSolid); k += 1)
            if (isInterferingCollision(context->evCollision({ "tools" : sweepBody, "targets" : toolsFacesSolid[k] })))
                try
                {
                    const splitId is Id = id + "splitPart" + unstableIdComponent(k);
                    context->setExternalDisambiguation(splitId, toolsFacesSolid[k]);
                    context->opSplitPartStable(splitId, {
                                "targets" : sweepBody,
                                "tool" : toolsFacesSolid[k],
                                "keepTools" : true
                            });
                    bodiesToIntersect = append(bodiesToIntersect, qOwnerBody(toolsFacesSolid[k]));
                    facesToMove += qCreatedBy(splitId, EntityType.FACE);

                }

        bodiesToIntersect = context->evaluateQuery(bodiesToIntersect->qUnion());
        var partsToDelete is Query = emptyQ;
        if (bodiesToIntersect != [])
        {
            // debug(context, sweepBody, DebugColor.GREEN);
            // debug(context, bodiesToIntersect->qUnion(), DebugColor.BLUE);
            const collisions is array = context->evCollision({
                        "tools" : sweepBody,
                        "targets" : bodiesToIntersect->qUnion()
                    });

            for (var collision in collisions)
                if (collision["type"] == ClashType.INTERFERE)
                    partsToDelete += collision.toolBody;
        }

        // Delete parts that intersect the owner bodies of trimFaces
        toDelete[] += context->evaluateQuery(partsToDelete)->qUnion();

        sweepBody -= partsToDelete;

        // We then boolean the sweep body together
        if (@size(context->evaluateQuery(sweepBody)) > 1)
        {
            try(context->opBoolean(id + "beamBooleanTogether", {
                            "tools" : sweepBody,
                            "operationType" : BooleanOperationType.UNION
                        }));
            context->processSubfeatureStatus(id, {
                        "subfeatureId" : id + "beamBooleanTogether",
                        "propagateErrorDisplay" : true
                    });
        }

        const toolsFacesPlane is array = context->evaluateQuery(trimFaces->qConstructionFilter(ConstructionObject.YES));
        for (var k = 0; k < @size(toolsFacesPlane); k += 1)
            try
            {
                const plane is Plane = context->evPlane({
                            "face" : toolsFacesPlane[k]
                        });
                if (context->evaluateQuery(sweepBody->qIntersectsPlane(plane)) != [])
                {
                    const splitPartId is Id = id + "splitPartConstruction" + unstableIdComponent(k);
                    context->setExternalDisambiguation(splitPartId, toolsFacesPlane[k]);
                    context->opSplitPartStable(splitPartId, {
                                "targets" : sweepBody,
                                "tool" : toolsFacesPlane[k],
                                "keepTools" : true
                            });
                    facesToMove += qCreatedBy(splitPartId, EntityType.FACE);
                }
            }
    }

    var trimParts is Query = definition.trimParts;
    const hasTrimParts is boolean = context->evaluateQuery(trimParts) != [];
    if (hasTrimParts)
    {
        // Trimming by parts
        var prevFaces is Query = context->evaluateQuery(sweepBody->qOwnedByBody(EntityType.FACE))->qUnion();

        prevFaces += context->startTracking(prevFaces);

        var offsetWorked = false;
        if (hasWeldGap)
            try silent
            {
                const endFaces is Query = context->startTracking(context->getEndFaces(trimParts)); // Don't offset with the endFaces
                // Try offsetting before booleaning
                context->opPattern(id + "trimPartPattern", {
                            "entities" : trimParts,
                            "transforms" : [identityTransform()],
                            "instanceNames" : ["1"]
                        });
                toDelete[] += qCreatedBy(id + "trimPartPattern", EntityType.BODY);
                context->opOffsetFace(id + "trimPartOffset", {
                            "moveFaces" : qCreatedBy(id + "trimPartPattern", EntityType.FACE) - endFaces,
                            "offsetDistance" : weldGap
                        });
                offsetWorked = true;
                trimParts = qCreatedBy(id + "trimPartPattern", EntityType.BODY);
            }

        try(context->opBoolean(id + "trimBoolean", {
                        "tools" : trimParts,
                        "targets" : sweepBody,
                        "operationType" : BooleanOperationType.SUBTRACTION,
                        "keepTools" : true
                    }));
        context->processSubfeatureStatus(id, {
                    "subfeatureId" : id + "trimBoolean",
                    "propagateErrorDisplay" : true
                });

        const planarFaces is array = context->evaluateQuery(qCreatedBy(id + "trimBoolean", EntityType.FACE)->qGeometry(GeometryType.PLANE));

        for (var face in planarFaces)
        {
            const planeNormal is Vector = context->evPlane({
                            "face" : face
                        }).normal;

            const cylinderTangentFacesQuery is array = context->evaluateQuery(
                    face->qAdjacent(AdjacencyType.EDGE, EntityType.FACE)->qGeometry(GeometryType.CYLINDER) *
                    qCreatedBy(id + "trimBoolean", EntityType.FACE) *
                    face->qTangentConnectedFaces()
                );
            // Filter to only concave cylinders
            const cylTangentFaces = cylinderTangentFacesQuery->filter(function(q is Query) returns boolean
                    {
                        const cylinder is Cylinder = context->evSurfaceDefinition({
                                    "face" : q
                                });
                        const tangentPlane is Plane = context->evFaceTangentPlane({
                                    "face" : q,
                                    "parameter" : vector(0.5, 0.5)
                                });
                        return isPointOnLine(
                                tangentPlane.origin + tangentPlane.normal * cylinder.radius,
                                line(cylinder.coordSystem.origin, cylinder.coordSystem.zAxis)
                            );
                    })->mapArray(
                    function(q is Query) returns Query
                {
                    return q + context->startTracking(q);
                });
            if (cylTangentFaces != [])
                facesToReplace = append(facesToReplace, {
                            "faces" : cylTangentFaces->qUnion(),
                            "template" : face + context->startTracking(face)
                        });
        }

        if (offsetWorked)
        {
            facesNonMoved += qCreatedBy(id + "trimBoolean", EntityType.FACE);
            facesNonMoved += context->evaluateQuery(sweepBody->qOwnedByBody(EntityType.FACE) - prevFaces)->qUnion();
        }
        else
        {
            facesToMove += qCreatedBy(id + "trimBoolean", EntityType.FACE);

            // This is a workaround for qCreatedBy(id) sometimes not giving all the faces
            facesToMove += context->evaluateQuery(sweepBody->qOwnedByBody(EntityType.FACE) - prevFaces)->qUnion();
        }
    }

    {
        const parts = context->evaluateQuery(sweepBody);
        const partsToDelete = parts->filter(function(part is Query) returns boolean
                {
                    if (@size(context->evaluateQuery(part->qOwnedByBody(EntityType.FACE))) < (definition.profileEdgeCount + 2)) // It has had faces cut off it.
                        return true;
                    if (hasTrimParts)
                    {
                        const trimmedBy = part->qOwnedByBody(EntityType.FACE)->qDependency()->qOwnerBody()->qBodyType(BodyType.SOLID) * trimParts;
                        if (context->evaluateQuery(trimmedBy) != [])
                            return context->isEnclosed(part, trimmedBy);
                    }
                    return false;
                })->qUnion();
        // Keep only the largest body/bodies
        toDelete[] += partsToDelete;

        sweepBody -= partsToDelete;
    }

    // We then boolean the sweep body together again
    if (@size(context->evaluateQuery(sweepBody)) > 1)
    {
        try(context->opBoolean(id + "beamBooleanTogether2", {
                        "tools" : sweepBody,
                        "operationType" : BooleanOperationType.UNION
                    }));
        context->processSubfeatureStatus(id, {
                    "subfeatureId" : id + "beamBooleanTogether2",
                    "propagateErrorDisplay" : true
                });
    }

    var endFaces is Query = context->evaluateQuery(
            qCapEntity(id + "sweep", CapType.EITHER, EntityType.FACE) +
            facesToMove + facesNonMoved
        )->qUnion();
    endFaces += context->startTracking(endFaces);
    if (hasWeldGap && context->evaluateQuery(facesToMove->qOwnedByBody(sweepBody)) != [])
    {
        try(context->opOffsetFace(id + "moveCutFaces", {
                        "moveFaces" : qOwnedByBody(sweepBody) * facesToMove,
                        "offsetDistance" : -weldGap
                    }));
        context->processSubfeatureStatus(id, {
                    "subfeatureId" : id + "moveCutFaces",
                    "propagateErrorDisplay" : true
                });
    }
    for (var i = 0; i < @size(facesToReplace); i += 1)
    {
        const faceMap is map = facesToReplace[i];
        // Check that it actually works, because it may be a duplicate of one that has already been done
        if (context->evaluateQuery(faceMap.faces) != [] && context->evaluateQuery(faceMap.template) != [])
        {
            const replaceId is Id = id + "replaceCutFace" + unstableIdComponent(i);
            context->setExternalDisambiguation(replaceId, faceMap.template);
            try silent(context->opReplaceFace(replaceId, {
                            "replaceFaces" : faceMap.faces,
                            "templateFace" : faceMap.template
                        }));
        }
    }

    // End faces for joints
    if (!originalPath.closed)
    {
        const startJointFace is Query = qCapEntity(id + "sweep", CapType.START, EntityType.FACE) - qOwnedByBody(toDelete[]);
        const endJointFace is Query = qCapEntity(id + "sweep", CapType.END, EntityType.FACE) - qOwnedByBody(toDelete[]);
        const startVertexPoint is Vector = remainderTransform * firstEdgeLine.origin;
        const endVertexPoint is Vector = remainderTransform * lastEdgeLine.origin;
        if (context->evaluateQuery(startJointFace) != [])
        {
            endFaceOrder[] = append(endFaceOrder[], startJointFace);
            if (endFaceMap[][startVertexPoint] == undefined)
                endFaceMap[][startVertexPoint] = emptyQ;
            endFaceMap[][startVertexPoint] += startJointFace;
        }
        if (context->evaluateQuery(endJointFace) != [])
        {
            endFaceOrder[] = append(endFaceOrder[], endJointFace);
            if (endFaceMap[][endVertexPoint] == undefined)
                endFaceMap[][endVertexPoint] = emptyQ;
            endFaceMap[][endVertexPoint] += endJointFace;
        }
    }

    // Set attributes for cutlist
    context->setBeamAttributes(id, {
                "beams" : sweepBody,
                "lengthEdges" : sweepTracking->qOwnedByBody(sweepBody),
                "lengthFaces" : sweepSideFaces->qOwnedByBody(sweepBody),
                "profile" : definition.profileData,
                "weldGap" : weldGap.value,
                "canUseBBox" : usingExtrude,
                "originalLength" : context->evLength({ "entities" : originalPath.edges->qUnion() }),
                "profileCSys" : usingExtrude ?
                    getProfileCSys(
                            definition.profileData,
                            definition.profileOriginPoint,
                            remainderTransform * t * transform(vector(definition.offsetX, definition.offsetY, 0 * meter))
                        ) :
                    undefined,
                "endFaces" : endFaces
            });

    return context->evaluateQuery(sweepBody)->qUnion();
}

const interferingClashType is map = {
        (ClashType.INTERFERE) : true,
        (ClashType.TARGET_IN_TOOL) : true,
        (ClashType.TOOL_IN_TARGET) : true,
    };

function isInterferingCollision(collisionData is array) returns boolean
{
    for (var collision in collisionData)
        if (interferingClashType[collision["type"]] == true)
            return true;
    return false;
}

function opSplitPartStable(context is Context, id is Id, def is map)
{
    var token is map = {};
    var worked = false;
    try
    {
        token = context->startFeature(id, def);
        context->opSplitPart(id, def);
        worked = context->evaluateQuery(qCreatedBy(id)) != [];
    }
    if (worked)
        @endFeature(context, id, token);
    else
    {
        @abortFeature(context, id, token);
        throw regenError("Split no-op.");
    }
}

/**
 * Check if `part` is surrounded by `otherParts`
 */
function isEnclosed(context is Context, part is Query, otherParts is Query) returns boolean
{
    const center is Vector = context->evApproximateCentroid({ "entities" : part });
    var num is number = 0;
    for (var dir in [X_DIRECTION, -X_DIRECTION, Y_DIRECTION, -Y_DIRECTION, Z_DIRECTION, -Z_DIRECTION])
    {
        const points is array = context->evRaycast({
                    "entities" : otherParts,
                    "ray" : line(center, dir),
                    "closest" : true
                });
        if (points == [])
            continue;

        // TODO: Perhaps use the distance for calculation?
        num += 1;
        if (num >= 4) // It is surrounded by faces
            return true;
    }
    return false;
}

export function doJoints(context is Context, id is Id,
    jointMap is map, counter is number,
    buttJoints is Query, buttJointsFlipped is Query, buttJointBoolTrim is boolean,
    weldGap is ValueWithUnits, topId is Id) returns number
{
    const points is array = keys(jointMap);
    for (var point in points)
    {
        const faces is array = jointMap[point];
        const jointId is Id = id + unstableIdComponent(counter);
        context->setExternalDisambiguation(jointId, faces[0]);

        if (context->evaluateQuery(buttJoints->qWithinRadius(point, TOLERANCE.booleanDefaultTolerance * meter)) != [])
        {
            const num is number = context->indexOfQ(buttJoints.subqueries, buttJoints->qWithinRadius(point, TOLERANCE.booleanDefaultTolerance * meter));
            context->doButtJoint(jointId,
                    faces,
                    weldGap,
                    context->evaluateQuery(buttJointsFlipped->qWithinRadius(point, TOLERANCE.booleanDefaultTolerance * meter)) != [],
                    buttJointBoolTrim,
                    num,
                    topId);
        }
        else
            context->doMiterJoint(jointId, faces, weldGap);

        counter += 1;
    }
    return counter;
}

// Joint functions
function doMiterJoint(context is Context, id is Id, faces is array, weldGap is ValueWithUnits)
{
    const face0 is Query = context->evaluateQuery(faces[0])->qUnion();
    const face1 is Query = context->evaluateQuery(faces[1])->qUnion();

    const p0 is Plane = context->evPlane({ "face" : face0 });
    var p1 is Plane = context->evPlane({ "face" : face1 });

    if (parallelVectors(p0.normal, p1.normal))
        return;

    p1.normal *= -1;
    const intersectionR = intersection(p0, p1);
    if (intersectionR != undefined)
    {
        const midPlaneNormal is Vector = normalize(p0.normal + p1.normal);
        const angle is ValueWithUnits = angleBetween(p0.normal, p1.normal);
        try
        {
            context->opMoveFace(id + "moveFace0", {
                        "moveFaces" : face0,
                        "transform" : transform(-midPlaneNormal * weldGap / 2) * rotationAround(intersectionR, angle / 2)
                    });

            context->opMoveFace(id + "moveFace1", {
                        "moveFaces" : face1,
                        "transform" : transform(midPlaneNormal * weldGap / 2) * rotationAround(intersectionR, -angle / 2)
                    });
        }
    }
}

function doButtJoint(context is Context, id is Id, faces is array, weldGap is ValueWithUnits, flipped is boolean, booleanTrim is boolean, manipNum is number, topId is Id)
{
    var face0 is Query = faces[flipped ? 1 : 0];
    const face1 is Query = faces[flipped ? 0 : 1];

    var face0Plane is Plane = context->evPlane({ "face" : face0 });

    var face1Plane is Plane = context->evPlane({ "face" : face1 });

    if (parallelVectors(face0Plane.normal, face1Plane.normal))
        return;

    const isAcute is boolean = angleBetween(face0Plane.normal, face1Plane.normal) < (0.5 * PI * radian);

    face0Plane.x = normalize(cross(cross(face1Plane.normal, face0Plane.normal), face0Plane.normal));
    face1Plane.x = normalize(cross(cross(face0Plane.normal, face1Plane.normal), face1Plane.normal));

    const face0Box is Box3d = context->evBox3d({
                "topology" : face0,
                "tight" : true,
                "cSys" : coordSystem(face0Plane)
            });

    const face1Box is Box3d = context->evBox3d({
                "topology" : face1,
                "tight" : true,
                "cSys" : coordSystem(face1Plane)
            });


    const face0Line is Line = line(face0Plane.origin + face0Plane.x * face0Box.maxCorner[0], face0Plane.normal);
    const face1Line is Line = line(face1Plane.origin + face1Plane.x * face1Box.maxCorner[0], face1Plane.normal);
    const face1MaxLine is Line = line(face1Plane.origin + face1Plane.x * face1Box.minCorner[0], face1Plane.normal);

    // The following algorithm calculates a transform for each face to get it in a butt joint position

    // Face0 is the face that is extended and Face1 is the face that is trimmed back

    // Create perpendicular planes from face0Line and face1Line
    const face0PerpPlane is Plane = plane(face0Line.origin, face0Plane.x, face0Line.direction);

    const face1PerpPlane is Plane = plane(face1Line.origin, face1Plane.x, face1Line.direction);
    const face1MaxPerpPlane is Plane = plane(face1MaxLine.origin, face1Plane.x, face1Line.direction);

    const planeIntersection is Line = intersection(face0PerpPlane, face1PerpPlane);
    const planeMaxIntersection is Line = intersection(face0PerpPlane, face1MaxPerpPlane);

    const face0ExtendDistance is ValueWithUnits = worldToPlane(face0PerpPlane, planeMaxIntersection.origin)[0];

    const face1Angle is ValueWithUnits = angleBetween(face1Line.direction, -face0Plane.x);

    // Do the manipulator
    const manipOrigin is Vector = face0Plane.origin + face0Plane.x * (face0Box.minCorner[0] + face0Box.maxCorner[0]) / 2 + face0Line.direction * face0ExtendDistance;
    const manip is Manipulator = flipManipulator({
                "base" : manipOrigin,
                "direction" : flipped ? -face0Line.direction : face0Line.direction,
                "flipped" : flipped
            });
    context->addManipulators(topId, {
                ("buttJoint" ~ manipNum) : manip
            });

    const body0 is Query = context->evaluateQuery(qOwnerBody(face0))->qUnion();
    face0 += context->startTracking(face0);
    const face0Transform is Transform = transform(face0Line.direction * face0ExtendDistance);
    context->opMoveFace(id + "moveFace0", {
                "moveFaces" : face0,
                "transform" : face0Transform
            });

    if (booleanTrim)
    {
        const face0MidLine is Line = line(face0Plane.origin + face0Plane.x * (face1Box.maxCorner[0] + face0Box.minCorner[0]) / 2, face0Plane.normal);
        const face0MidPerpPlane is Plane = plane(face0MidLine.origin, face0Plane.x, face0Line.direction);
        const planeMidIntersection is Line = intersection(face0MidPerpPlane, face1PerpPlane);
        const face1ExtendDistance is ValueWithUnits = worldToPlane(face1PerpPlane, planeMidIntersection.origin)[0];

        var body1 is Query = context->evaluateQuery(qOwnerBody(face1))->qUnion();
        body1 += context->startTracking(body1);
        const face1Transform is Transform = rotationAround(planeMidIntersection, isAcute ? -face1Angle : face1Angle) *
            transform(face1Line.direction * face1ExtendDistance);
        context->opMoveFace(id + "moveFace1", {
                    "moveFaces" : face1,
                    "transform" : face1Transform
                });
        context->opPattern(id + "body0Pattern", {
                    "entities" : body0,
                    "transforms" : [identityTransform()],
                    "instanceNames" : ["1"]
                });
        var alreadyOffset = tolerantEquals(weldGap, 0 * meter); // We don't need to offset if there isn't a gap
        if (!alreadyOffset)
            try silent
            {
                context->opOffsetFace(id + "extendBody0", {
                            "moveFaces" : qCreatedBy(id + "body0Pattern", EntityType.FACE),
                            "offsetDistance" : weldGap
                        });
                alreadyOffset = true;
            }
        context->opBoolean(id + "booleanTrim", {
                    "tools" : qCreatedBy(id + "body0Pattern", EntityType.BODY),
                    "targets" : body1,
                    "operationType" : BooleanOperationType.SUBTRACTION
                });
        if (context->evaluateQuery(body1) == [])
            throw regenError("Weld gap is too large. The beam was consumed at highlighted joint.", qAdjacent(face0, AdjacencyType.EDGE, EntityType.EDGE));

        if (!alreadyOffset)
            try
            {
                context->opOffsetFace(id + "trimBody1", {
                            "moveFaces" : qCreatedBy(id + "booleanTrim", EntityType.FACE),
                            "offsetDistance" : -weldGap
                        });
            }
            catch
            {
                context->setErrorEntities(topId, {
                            "entities" : qCreatedBy(id + "booleanTrim", EntityType.FACE)
                        });
                context->reportFeatureWarning(id, "Could not make weld gap on highlighted faces");
            }

        // Would this be any better using isEnclosed like the other trimming one?
        const toDelete is Query = body1 - qLargest(body1);
        if (context->evaluateQuery(toDelete) != [])
            context->opDeleteBodies(id + "deleteTrimmedParts", {
                        "entities" : toDelete
                    });

        const prevAtt is BeamAttribute = context->getBeamAttribute(body1);

        var newAtt = prevAtt;
        newAtt.beam = body1;
        if (newAtt.endFaces == undefined)
            newAtt.endFaces = emptyQ;

        newAtt.endFaces += qCreatedBy(id + "booleanTrim", EntityType.FACE);
        context->setBeamAttributes(id, newAtt);
    }
    else
    {
        const face1ExtendDistance is ValueWithUnits = worldToPlane(face1PerpPlane, planeIntersection.origin)[0];
        const face1Transform is Transform = transform(face0PerpPlane.normal * weldGap) * rotationAround(planeIntersection, isAcute ? -face1Angle : face1Angle) * transform(face1Line.direction * face1ExtendDistance);
        context->opMoveFace(id + "moveFace1", {
                    "moveFaces" : face1,
                    "transform" : face1Transform
                });
    }
}

export function updateDefinitionForManip(context is Context, definition is map, key is string, manip is map) returns map
{
    if (key == "points")
        definition.profileOriginPoint = manip.index - 1;
    else if (key == "XOffset")
    {
        // Reset the other offset so the manipulator doesn't suddenly jump
        if (!definition.hasOffset)
            definition.offsetY = 0 * meter;

        definition.hasOffset = true;
        definition.offsetX = abs(manip.offset);
        definition.offsetXOpposite = manip.offset < 0;
    }
    else if (key == "YOffset")
    {
        // Reset the other offset so the manipulator doesn't suddenly jump
        if (!definition.hasOffset)
            definition.offsetX = 0 * meter;

        definition.hasOffset = true;
        definition.offsetY = abs(manip.offset);
        definition.offsetYOpposite = manip.offset < 0;
    }
    else
    {
        const chars is array = splitIntoCharacters(key);
        if (subArray(chars, 0, 9) == splitIntoCharacters("buttJoint"))
        {
            const num is number = join(subArray(chars, 9, @size(chars)))->stringToNumber();
            const points is array = context->evaluateQuery(definition.buttJoints);
            if (@size(points) > num) // Just a check to make sure that we can do it
            {
                if (manip.flipped)
                    definition.buttJointsFlipped += points[num];
                else
                    definition.buttJointsFlipped -= qWithinRadius(qEverything(), context->evVertexPoint({ "vertex" : points[num] }), TOLERANCE.booleanDefaultTolerance * meter);
            }
            // Get rid of any flipped ones that are no longer joints
            definition.buttJointsFlipped *= definition.buttJoints;
        }
    }
    return definition;
}

FeatureScript 1420;

import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/evaluate.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");

export import(path : "onshape/std/path.fs", version : "1420.0");

import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

/**
 * Constructs [Path]s from a [Query] of edges, picking the starting point of the
 *      [Path]s based on query evaluation order for edgesQuery
 *
 * @param context {Context}
 * @param edgesQuery {Query}: A [Query] of edges to form into a [Path]. The edges are
 *      ordered with query evaluation order.
 */
export function constructPaths(context is Context, edgesQuery is Query) returns array
{
    const edges is array = context->evaluateQuery(edgesQuery);

    const edgeSize is number = @size(edges);
    if (edgeSize == 0)
        return [];

    const edgeTangentLines is array = edges->mapArray(function(edge)
        {
            return context->evEdgeTangentLines({
                        "edge" : edge,
                        "parameters" : [0, 1]
                    });
        });

    const edgeEndpoints is array = edgeTangentLines->mapArray(function(lines)
        {
            return [lines[0].origin, lines[1].origin];
        });

    var paths = [];
    var edgeUsed = makeArray(edgeSize, false);

    for (var i = 0; i < edgeSize; i += 1)
        if (tolerantEquals(edgeEndpoints[i][0], edgeEndpoints[i][1])) // Do closed curves
        {
            edgeUsed[i] = true;
            paths = paths->append({ "edges" : [edges[i]], "flipped" : [false], "closed" : true } as Path);
        }

    while (edgeUsed->indexOf(false) >= 0)
    {
        var currentEdgeArr = [[edgeUsed->indexOf(false), false]];
        var prevEdgeEndpoint = edgeEndpoints[currentEdgeArr[0][0]][1];
        var startPoint = edgeEndpoints[currentEdgeArr[0][0]][0];

        edgeUsed[currentEdgeArr[0][0]] = true;

        while (true)
        {
            if (tolerantEquals(startPoint, prevEdgeEndpoint))
                break;

            var addedEdge = false;
            for (var i = 0; i < edgeSize; i += 1)
            {
                if (edgeUsed[i])
                    continue;

                if (tolerantEquals(edgeEndpoints[i][0], prevEdgeEndpoint))
                {
                    edgeUsed[i] = true;
                    prevEdgeEndpoint = edgeEndpoints[i][1];
                    currentEdgeArr = currentEdgeArr->append([i, false]);
                    addedEdge = true;
                    break;
                }
                if (tolerantEquals(edgeEndpoints[i][1], prevEdgeEndpoint))
                {
                    edgeUsed[i] = true;
                    prevEdgeEndpoint = edgeEndpoints[i][0];
                    currentEdgeArr = currentEdgeArr->append([i, true]);
                    addedEdge = true;
                    break;
                }
            }

            if (!addedEdge)
                break;
        }

        {
            const cache = startPoint;
            startPoint = prevEdgeEndpoint;
            prevEdgeEndpoint = cache;
        }
        while (true)
        {
            if (tolerantEquals(startPoint, prevEdgeEndpoint))
                break;

            var addedEdge = false;
            for (var i = 0; i < edgeSize; i += 1)
            {
                if (edgeUsed[i])
                    continue;

                if (tolerantEquals(edgeEndpoints[i][1], prevEdgeEndpoint))
                {
                    edgeUsed[i] = true;
                    prevEdgeEndpoint = edgeEndpoints[i][0];
                    currentEdgeArr = concatenateArrays([[[i, false]], currentEdgeArr]);
                    addedEdge = true;
                    break;
                }
                if (tolerantEquals(edgeEndpoints[i][0], prevEdgeEndpoint))
                {
                    edgeUsed[i] = true;
                    prevEdgeEndpoint = edgeEndpoints[i][1];
                    currentEdgeArr = concatenateArrays([[[i, true]], currentEdgeArr]);
                    addedEdge = true;
                    break;
                }
            }

            if (!addedEdge)
                break;
        }

        paths = append(paths, {
                        "edges" : currentEdgeArr->mapArray(function(edge)
                            {
                                return edges[edge[0]];
                            }),
                        "flipped" : currentEdgeArr->mapArray(function(edge)
                            {
                                return edge[1];
                            }),
                        "closed" : tolerantEquals(startPoint, prevEdgeEndpoint)
                    } as Path);
    }
    return paths;
}

export function getTangentPaths(context is Context, paths is array, splitTangent is boolean) returns array
{
    var outPaths = [];
    for (var path in paths)
    {
        const tangentPaths is array = context->splitTangentPaths(path, splitTangent);
        for (var tangentPath in tangentPaths)
            outPaths = outPaths->append(tangentPath);
    }
    return outPaths;
}


function splitTangentPaths(context is Context, path is Path, splitTangent is boolean)
{
    const edgeSize is number = @size(path.edges);
    if (edgeSize == 1)
        return [path];

    if (splitTangent)
    {
        var paths = [];
        for (var i = 0; i < edgeSize; i += 1)
        {
            paths = paths->append({
                            "edges" : [path.edges[i]],
                            "flipped" : [path.flipped[i]],
                            "closed" : false
                        } as Path);
        }
        return paths;
    }
    var startEndDirection = makeArray(edgeSize);
    for (var i = 0; i < edgeSize; i += 1)
    {
        const tangentLines is array = context->evEdgeTangentLines({
                    "edge" : path.edges[i],
                    "parameters" : [0, 1]
                });
        var tangentDirs is array = tangentLines->collectSubParameters("direction");

        if (path.flipped[i])
            tangentDirs = [-tangentDirs[1], -tangentDirs[0]];
        startEndDirection[i] = tangentDirs;

    }
    var edgeUsed = makeArray(edgeSize, false);

    var tangentPaths = [];
    while (edgeUsed->indexOf(false) != -1)
    {
        var currentEdgeIndex = edgeUsed->indexOf(false);

        edgeUsed[currentEdgeIndex] = true;

        var currentEdgeIndexes = [currentEdgeIndex];
        while (true)
        {
            var addedEdge = false;

            var nextIndex = currentEdgeIndex + 1;
            if (nextIndex >= edgeSize)
                nextIndex = 0;
            if (!path.closed && nextIndex == 0)
                break;
            // TODO: Increase the tolerance (L231 as well)
            if (!edgeUsed[nextIndex] && tolerantEquals(startEndDirection[currentEdgeIndex][1], startEndDirection[nextIndex][0]))
            {
                edgeUsed[nextIndex] = true;
                currentEdgeIndex = nextIndex;
                currentEdgeIndexes = currentEdgeIndexes->append(currentEdgeIndex);
                addedEdge = true;
            }
            if (!addedEdge)
                break;
        }

        currentEdgeIndex = currentEdgeIndexes[0];
        while (true)
        {
            var addedEdge = false;
            var prevIndex = currentEdgeIndex - 1;
            if (prevIndex < 0)
                prevIndex = edgeSize - 1;
            if (!path.closed && prevIndex == edgeSize - 1)
                break;
            if (!edgeUsed[prevIndex] && tolerantEquals(startEndDirection[currentEdgeIndex][0], startEndDirection[prevIndex][1]))
            {
                edgeUsed[prevIndex] = true;
                currentEdgeIndex = prevIndex;
                currentEdgeIndexes = concatenateArrays([[currentEdgeIndex], currentEdgeIndexes]);
                addedEdge = true;
            }
            if (!addedEdge)
                break;
        }

        tangentPaths = tangentPaths->append({
                        "edges" : currentEdgeIndexes->mapArray(function(num)
                            {
                                return path.edges[num];
                            }),
                        "flipped" : currentEdgeIndexes->mapArray(function(num)
                            {
                                return path.flipped[num];
                            }),
                        "closed" : path.closed && @size(path.edges) == @size(currentEdgeIndexes),
                    } as Path);
    }
    return tangentPaths;
}

FeatureScript 1420;

/**
 * This module includes utilities for this feature.
 * The exported utilities are:
 *
 * Queries
 * `emptyQ is Query`
 * `operator+(q1 is Query, q2 is Query)`
 * `operator-(q1 is Query, q2 is Query)`
 * `operator*(q1 is Query, q2 is Query)`
 * `qQueryCompoundFilter(q is Query, filter is QueryFilterCompound) returns Query`
 *
 * Arrays
 * `join(arr is array) returns string`
 * `indexOfQ(context is Context, arr is array, q is Query) returns number`
 * `indexOf(arr is array, value) returns number`
 * `collectSubParameters(parameterArray is array, parameterName is string) returns array`
 *
 * Rotation
 * `mcAxisTypeToAngle[MateConnectorAxisType] -> ValueWithUnits (ANGLE_UNITS)`
 *
 * Custom Properties
 * `checkPropertyId(definition is map, propertyIdKey is string)`
 * `cpProfileNameIds is array`
 * `cpLengthIds is array`
 * `cpQuantityIds is array`
 * `cpAngle1Ids is array`
 * `cpAngle2Ids is array`
 */
import(path : "onshape/std/context.fs", version : "1420.0");
import(path : "onshape/std/curveGeometry.fs", version : "1420.0");
import(path : "onshape/std/error.fs", version : "1420.0");
import(path : "onshape/std/evaluate.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/properties.fs", version : "1420.0");
import(path : "onshape/std/string.fs", version : "1420.0");
import(path : "onshape/std/units.fs", version : "1420.0");

export import(path : "onshape/std/mateconnectoraxistype.gen.fs", version : "1420.0");

/** Exactly that: an empty [Query]. */
export const emptyQ is Query = qUnion([]);

export operator+(lhs is Query, rhs is Query) returns Query
{
    if (lhs.queryType == QueryType.UNION)
    {
        lhs.subqueries = @resize(lhs.subqueries, @size(lhs.subqueries) + 1, rhs);
        return lhs;
    }
    return [lhs, rhs]->qUnion();
}

export operator-(lhs is Query, rhs is Query) returns Query
{
    if (lhs.queryType == QueryType.SUBTRACTION)
    {
        lhs.query2 += rhs;
        return lhs;
    }
    return lhs->qSubtraction(rhs);
}

export operator*(lhs is Query, rhs is Query) returns Query
{
    if (lhs.queryType == QueryType.INTERSECTION)
    {
        lhs.subqueries = @resize(lhs.subqueries, @size(lhs.subqueries) + 1, rhs);
        return lhs;
    }
    return [lhs, rhs]->qIntersection();
}

/**
 * Filters `q` by `filter`
 *
 * @param q {Query} : The [Query] to filter.
 * @param filter {QueryFilterCompound} : The [QueryFilterCompound] to filter by.
 */
// This could possibly be merged to Onshape's library
export function qQueryCompoundFilter(q is Query, filter is QueryFilterCompound) returns Query
{
    return q * (switch (filter) {
                            (QueryFilterCompound.ALLOWS_AXIS) : [
                                    q->qGeometry(GeometryType.LINE),
                                    q->qGeometry(GeometryType.CIRCLE),
                                    q->qGeometry(GeometryType.ARC),
                                    q->qGeometry(GeometryType.CYLINDER),
                                    q->qBodyType(BodyType.MATE_CONNECTOR)
                                ],

                            (QueryFilterCompound.ALLOWS_DIRECTION) : [
                                    q->qGeometry(GeometryType.LINE),
                                    q->qGeometry(GeometryType.CIRCLE),
                                    q->qGeometry(GeometryType.ARC),
                                    q->qGeometry(GeometryType.PLANE),
                                    q->qGeometry(GeometryType.CYLINDER),
                                    q->qBodyType(BodyType.MATE_CONNECTOR)
                                ],

                            (QueryFilterCompound.ALLOWS_PLANE) : [
                                    q->qGeometry(GeometryType.PLANE),
                                    q->qBodyType(BodyType.MATE_CONNECTOR)
                                ],

                            (QueryFilterCompound.ALLOWS_VERTEX) : [
                                    q->qEntityFilter(EntityType.VERTEX),
                                    q->qBodyType(BodyType.MATE_CONNECTOR)
                                ]
                        })->qUnion();
}

// Arrays
/**
 * Converts an array to a string, using toString on each item, and without any separators.
 *
 * @param arr {array} : The array to convert to a string.
 */
export function join(arr is array) returns string
{
    var out is string = "";
    for (var s in arr)
        out ~= s->toString();
    return out;
}

/**
 * This function is like `join(arr)`, except it assumes that the array is already made up out of strings
 */
export function joinF(arr is array) returns string
{
    var out is string = "";
    for (var s in arr)
        out ~= s;
    return out;
}

/**
 * Gets the index of a [Query] in an array, using the [Context] for checking.
 *
 * @param context {Context}
 * @param arr {array} : The array to look in.
 * @param q {Query} : The [Query] to find.
 */
export function indexOfQ(context is Context, arr is array, q is Query) returns number
{
    const s is number = @size(arr);
    for (var i = 0; i < s; i += 1)
        if (context->evaluateQuery(arr[i] * q) != [])
            return i;

    return -1;
}

/**
 * Gets the index of `value` in an array, using == for comparison.
 *
 * @param arr {array} : The array to look in.
 * @param value : The value to find.
 */

export function indexOf(arr is array, value) returns number
{
    const s is number = @size(arr);
    for (var i is number = 0; i < s; i += 1)
        if (arr[i] == value)
            return i;

    return -1;
}

/**
 * Maps an array to its sub parameters.
 */
// This is basically a copy of the function in Onshape's loft.fs
export function collectSubParameters(parameterArray is array, parameterName is string) returns array
{
    var retSubParameters = [];
    var s = 0;

    for (var param in parameterArray)
    {
        s += 1;
        retSubParameters = @resize(retSubParameters, s, param[parameterName]);
    }

    return retSubParameters;
}

// These are used in beamInternal.fs for patterns
export function startTrackingArray(context is Context, arr is array) returns array
{
    // Inlined mapArray
    var result = @resize(arr, 0); // keep type tag
    for (var edge in arr)
        result = @resize(result, @size(result) + 1, context->startTracking(edge)); // inlined append
    return result;
}

export function endTrackingArray(context is Context, arr is array) returns array
{
    // Inlined mapArray
    var result = @resize(arr, 0); // keep type tag
    for (var edge in arr)
        result = @resize(result, @size(result) + 1, context->evaluateQuery(edge)[0]); // inlined append
    return result;
}


// Remapping variables
/**
 * This function maps variables denoted by `#variable` to the appropriate variable in the context.
 */
// Used in beamCustomProfileGenerator.fs
export function remapVariables(context is Context, text is string) returns string
{
    // An optimisation if there is no variable references
    if (replace(text, "#", "") == text)
        return text;

    var variables is map = context->getAllVariables();
    variables[" "] = ""; // Replace "# " with ""
    var out is string = "";
    const chars is array = text->splitIntoCharacters();
    const charsSize is number = @size(chars);
    for (var i = 0; i < charsSize; i += 1)
    {
        const char is string = chars[i];
        if (char == "#")
        {
            if (i < charsSize - 1 && chars[i + 1] == "#")
            {
                out ~= "#";
                i += 1;
                continue;
            }
            const varName = getVarName(chars, i + 1);
            if (varName != undefined && variables[varName] != undefined)
            {
                out ~= variables[varName]->toString();
                i += varName->length();
            }
            else
                out ~= char;
        }
        else
            out ~= char;
    }
    return out;
}

function getVarName(chars is array, i is number)
{
    var out is string = "";
    for ( ; i < @size(chars) && nonSpecial[chars[i]] == true; i += 1)
        out ~= chars[i];

    if (out == "" && i < @size(chars) && chars[i] == " ")
        return " ";

    return out == "" ? undefined : out;
}

const nonSpecial = function()
    {
        const chars is array = "1234567890_qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM"->splitIntoCharacters();
        var out is map = {};
        for (var char in chars)
            out[char] = true;

        return out;
    }();


// Used in: beam.fs, beamAttached.fs
export const mcAxisTypeToAngle is map = {
        (undefined) : 0 * degree,
        (MateConnectorAxisType.PLUS_X) : 0 * degree,
        (MateConnectorAxisType.PLUS_Y) : 90 * degree,
        (MateConnectorAxisType.MINUS_X) : 180 * degree,
        (MateConnectorAxisType.MINUS_Y) : 270 * degree,
    };

// Custom property ids

/**
 * Checks that `propertyId` is the correct length and consists of the correct characters.
 * Throws an error otherwise, using `propertyIdKey` as the parameter id.
 *
 * @param propertyId {string}
 * @param propertyIdKey {string}
 */
// Used in: beam.fs, beamAttached.fs, beamCutlist.fs
export function checkPropertyId(definition is map, propertyIdKey is string) returns undefined
{
    if (!(definition[propertyIdKey]->match("[0-9a-fA-F]{24}").hasMatch))
        throw regenError("Custom property id must be 24 hex digits.", [propertyIdKey]);
}

export const cpProfileNameIds is array = [
        "5d30f0b6a6f05d155b6e4759", // Tek-Pac
        "5d1c23cd37bcfb15e1a0389c", // Arrowquip
        "6083aacfffb22011a3046074", // MFI
    ];

export const cpLengthIds is array = [
        "5d30eed295ca0414d5d3dc64", // Tek-Pac
        "5d3f81fff7ef261514b35db1", // CSM
        "5d1c27c637bcfb15e1a087ce", // Arrowquip
        "6083ab7a05b21d0edaf7bf2a", // MFI
    ];

export const cpQuantityIds is array = [
        "5d30fa05a6f05d155b6e818a", // Tek-Pac
    ];

export const cpAngle1Ids is array = [
        "5ecada03aa2a8714c1ad49ad", // Tek-Pac
        "6083abc005b21d0edaf7c007", // MFI
    ];

export const cpAngle2Ids is array = [
        "5ecada463275f414c2cf79f8", // Tek-Pac
        "6083abe605b21d0edaf7c0cf", // MFI
    ];

/**
 * Given a part and an array of property ids, this function tries to get a number out of any of those,
 * returning `def` if a number couldn't be found.
 *
 * This function is used in `beamCutlistInternal.fs`
 */
export function getPropertyNumber(context is Context, part is Query, cpList is array, def is number) returns number
{
    for (var id in cpList)
    {
        const result = try silent(context->getProperty({
                            "entity" : part,
                            "propertyType" : PropertyType.CUSTOM,
                            "customPropertyId" : id
                        })->stringToNumber());
        if (result is number)
            return result;
    }
    return def;
}

export function setProperty(context is Context, parts is Query, cpList is array, value is string)
{
    for (var id in cpList)
        context->setProperty({
                    "entities" : parts,
                    "propertyType" : PropertyType.CUSTOM,
                    "customPropertyId" : id,
                    "value" : value
                });
}

export predicate coincidentCircles(c1 is Circle, c2 is Circle)
{
    tolerantEquals(c1.radius, c2.radius) && tolerantEquals(c1.coordSystem.origin, c2.coordSystem.origin);
}


export function checkMinimumRadius(context is Context, topId is Id, entitiesQ is Query, radius is ValueWithUnits)
{
    const entities is array = context->evaluateQuery(entitiesQ);
    for (var edge in entities)
    {
        const def = context->evCurveDefinition({ "edge" : edge });
        if ((def is Circle) && def.radius < radius && !tolerantEquals(def.radius, radius))
        {
            context->setErrorEntities(topId, { "entities" : edge });
            if (!featureHasNonTrivialStatus(context, topId))
                context->reportFeatureWarning(topId, "Warning: Highlighted arc is too sharp. Please increase its radius to " ~ (radius / millimeter) ~ " mm or more.");
        }
    }
}

FeatureScript 1420;

import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/coordSystem.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/lookupTablePath.fs", version : "1420.0");
import(path : "onshape/std/math.fs", version : "1420.0");
import(path : "onshape/std/sketch.fs", version : "1420.0");
import(path : "onshape/std/string.fs", version : "1420.0");
import(path : "onshape/std/surfaceGeometry.fs", version : "1420.0");
import(path : "onshape/std/tabReferences.fs", version : "1420.0");
import(path : "onshape/std/valueBounds.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");

import(path : "292004f306ed436c76be47eb", version : "316705980497e6732a50d563");
import(path : "3c15f98f9494b9dcf1ea1019", version : "c66a69238c7e8f045df59283");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

export import(path : "6fb34667b55a246e198a34ad", version : "c67f4998909bab6f0689030f");
export import(path : "403b508ffd9211178df8cfdf", version : "e6ba5764ef59df8deba00683");
export import(path : "3251a0e42432bc5ea9fb299b", version : "adc2c0d51097f2f9020db009");
export import(path : "a5cc8463b3c728bdc3a9d1fc", version : "472b09c7949ec7af63263944");

export const PROFILE_LENGTH_BOUNDS is RealBoundSpec = { (unitless) : [10, 40, 1000], } as RealBoundSpec; // Used for diameter and width

export const PROFILE_LENGTH_BOUNDS_1 is RealBoundSpec = { (unitless) : [10, 65, 1000], } as RealBoundSpec;
export const PROFILE_LENGTH_BOUNDS_2 is RealBoundSpec = { (unitless) : [10, 50, 1000], } as RealBoundSpec;

export const PROFILE_THICKNESS_BOUNDS is RealBoundSpec = { (unitless) : [0.9, 3, 300], } as RealBoundSpec;

export const PROFILE_RADIUS_BOUNDS is RealBoundSpec = { (unitless) : [0, 0, 300], } as RealBoundSpec; // Used for fillet radius

// We shouldn't get a profile with this many points. However, checking can be performed when the profile is generated, not now.
export const PROFILE_ORIGIN_POINT_BOUNDS is IntegerBoundSpec = { (unitless) : [-1, -1, 1e5] } as IntegerBoundSpec;

export predicate profileSelection(definition)
{
    annotation { "Name" : "Profile type", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
    definition.profileType is ProfileType;

    if (definition.profileType == ProfileType.STEEL)
        annotation { "Name" : "Steel profile type", "Default" : SteelProfileType.SHS, "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.steelProfileType is SteelProfileType;

    if (definition.profileType == ProfileType.STAINLESS)
        annotation { "Name" : "Stainless steel profile type", "Default" : SteelProfileType.SHS, "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.stainlessProfileType is StainlessProfileType;

    else if (definition.profileType == ProfileType.SPECIAL)
        annotation { "Name" : "Profile type", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.specialProfileType is SpecialProfileType;

    else if (definition.profileType == ProfileType.ALUMINIUM)
        annotation { "Name" : "Aluminium profile type", "Default" : AluminiumProfileType.SHS_RHS, "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.aluminiumProfileType is AluminiumProfileType;

    annotation { "Name" : "Mirror over X axis", "UIHint" : UIHint.OPPOSITE_DIRECTION, "Default" : false }
    definition.flipYAxis is boolean;

    if (definition.profileType == ProfileType.ALUMINIUM)
    {
        annotation { "Group Name" : "Profile options", "Collapsed By Default" : false } // TODO: "Driving Parameter" : "aluminiumProfileType"
        {
            if (definition.aluminiumProfileType == AluminiumProfileType.ANGLE ||
                definition.aluminiumProfileType == AluminiumProfileType.SHS_RHS ||
                definition.aluminiumProfileType == AluminiumProfileType.CHANNEL ||
                definition.aluminiumProfileType == AluminiumProfileType.TEE)
            {
                annotation { "Name" : "Side 1", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aS1, PROFILE_LENGTH_BOUNDS_1);

                annotation { "Name" : "Side 2", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aS2, PROFILE_LENGTH_BOUNDS_2);
            }


            if (definition.aluminiumProfileType == AluminiumProfileType.CHS ||
                definition.aluminiumProfileType == AluminiumProfileType.BAR_ROUND)
                annotation { "Name" : "Outer diameter", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aD, PROFILE_LENGTH_BOUNDS);


            if (definition.aluminiumProfileType == AluminiumProfileType.BAR_FLAT)
                annotation { "Name" : "Width", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aW, PROFILE_LENGTH_BOUNDS);


            if (definition.aluminiumProfileType == AluminiumProfileType.ANGLE ||
                definition.aluminiumProfileType == AluminiumProfileType.SHS_RHS ||
                definition.aluminiumProfileType == AluminiumProfileType.CHS ||
                definition.aluminiumProfileType == AluminiumProfileType.BAR_FLAT ||
                definition.aluminiumProfileType == AluminiumProfileType.CHANNEL ||
                definition.aluminiumProfileType == AluminiumProfileType.TEE)
                annotation { "Name" : "Thickness", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aT, PROFILE_THICKNESS_BOUNDS);


            if (definition.aluminiumProfileType == AluminiumProfileType.CHANNEL ||
                definition.aluminiumProfileType == AluminiumProfileType.TEE)
                annotation { "Name" : "Back thickness", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aT2, PROFILE_THICKNESS_BOUNDS);


            if (definition.aluminiumProfileType == AluminiumProfileType.ANGLE ||
                definition.aluminiumProfileType == AluminiumProfileType.SHS_RHS ||
                definition.aluminiumProfileType == AluminiumProfileType.CHANNEL ||
                definition.aluminiumProfileType == AluminiumProfileType.TEE)
            {
                annotation { "Name" : "Inner radius", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aR1, PROFILE_RADIUS_BOUNDS);

                annotation { "Name" : "Outer radius", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aR2, PROFILE_RADIUS_BOUNDS);
            }

            if (definition.aluminiumProfileType == AluminiumProfileType.CHANNEL)
                annotation { "Name" : "End radius", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                isReal(definition.aR3, PROFILE_RADIUS_BOUNDS);
        }
    }
    else if (definition.profileType == ProfileType.STEEL)
    {
        if (definition.steelProfileType == SteelProfileType.EQUAL_ANGLE)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelEqualAngle is SteelEqualAngle;

        else if (definition.steelProfileType == SteelProfileType.UNEQUAL_ANGLE)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelUnequalAngle is SteelUnequalAngle;


        else if (definition.steelProfileType == SteelProfileType.SHS)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelSHS is SteelSHS;

        else if (definition.steelProfileType == SteelProfileType.RHS)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelRHS is SteelRHS;


        else if (definition.steelProfileType == SteelProfileType.TUBE)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelTube is SteelTube;

        else if (definition.steelProfileType == SteelProfileType.PIPE)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelPipe is SteelPipe;


        else if (definition.steelProfileType == SteelProfileType.BAR_ROUND)
            annotation { "Name" : "Size", "Default" : SteelRoundBar._20, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelRoundBar is SteelRoundBar;

        else if (definition.steelProfileType == SteelProfileType.BAR_SQUARE)
            annotation { "Name" : "Size", "Default" : SteelSquareBar._20, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelSquareBar is SteelSquareBar;

        else if (definition.steelProfileType == SteelProfileType.BAR_FLAT)
            annotation { "Name" : "Size", "Default" : SteelFlatBar._50_10, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelFlatBar is SteelFlatBar;

        else if (definition.steelProfileType == SteelProfileType.BAR_RYDAL_FLAT)
            annotation { "Name" : "Size", "Default" : SteelRydalFlatBar._13_3, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelRydalFlatBar is SteelRydalFlatBar;


        else if (definition.steelProfileType == SteelProfileType.PFC)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelPFC is SteelPFC;


        else if (definition.steelProfileType == SteelProfileType.LYSAGHT_ZED)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelLysaghtZed is SteelLysaghtZed;

        else if (definition.steelProfileType == SteelProfileType.LYSAGHT_CEE)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelLysaghtCee is SteelLysaghtCee;


        else if (definition.steelProfileType == SteelProfileType.UNIVERSAL_BEAM)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelUniversalBeam is SteelUniversalBeam;

        else if (definition.steelProfileType == SteelProfileType.UNIVERSAL_COLUMN)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelUniversalColumn is SteelUniversalColumn;


        else if (definition.steelProfileType == SteelProfileType.TFB)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelTFB is SteelTFB;


        else if (definition.steelProfileType == SteelProfileType.RAIL)
            annotation { "Name" : "Type", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.steelRail is SteelRail;
    }
    else if (definition.profileType == ProfileType.STAINLESS)
    {
        if (definition.stainlessProfileType == StainlessProfileType.SHS)
            annotation { "Name" : "Size", "Default" : StainlessSHS._30_0_1_2, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.stainlessSHS is StainlessSHS;

        else if (definition.stainlessProfileType == StainlessProfileType.RHS)
            annotation { "Name" : "Size", "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.stainlessRHS is StainlessRHS;


        else if (definition.stainlessProfileType == StainlessProfileType.TUBE)
            annotation { "Name" : "Size", "Default" : StainlessTube._31_8_1_2, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.stainlessTube is StainlessTube;

        else if (definition.stainlessProfileType == StainlessProfileType.PIPE)
            annotation { "Name" : "Size", "Default" : StainlessPipe._32_42_2_2_77, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.stainlessPipe is StainlessPipe;

        else if (definition.stainlessProfileType == StainlessProfileType.BAR_ROUND)
            annotation { "Name" : "Size", "Default" : StainlessRoundBar._20, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.stainlessRoundBar is StainlessRoundBar;

        else if (definition.stainlessProfileType == StainlessProfileType.BAR_SQUARE)
            annotation { "Name" : "Size", "Default" : StainlessSquareBar._20, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.stainlessSquareBar is StainlessSquareBar;

        else if (definition.stainlessProfileType == StainlessProfileType.BAR_FLAT)
            annotation { "Name" : "Size", "Default" : StainlessFlatBar._50_10, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.stainlessFlatBar is StainlessFlatBar;
    }
    else if (definition.profileType == ProfileType.SPECIAL)
    {
        if (definition.specialProfileType == SpecialProfileType.UNISTRUT)
            annotation { "Name" : "Size", "Default" : SpecialUnistrut.P1000, "UIHint" : [UIHint.REMEMBER_PREVIOUS_VALUE, UIHint.SHOW_LABEL] }
            definition.specialUnistrut is SpecialUnistrut;
    }
    else if (definition.profileType == ProfileType.CUSTOM_SKETCH)
        annotation { "Name" : "Profile sketch",
                    "Filter" : PartStudioItemType.SKETCH || PartStudioItemType.ENTIRE_PART_STUDIO,
                    "MaxNumberOfPicks" : 1,
                    "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.profileData is PartStudioData;

    else if (definition.profileType == ProfileType.MATCH)
        annotation { "Name" : "Beam for profile",
                    "Filter" : EntityType.BODY && BodyType.SOLID,
                    "MaxNumberOfPicks" : 1,
                    "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
        definition.profileBeam is Query;
}


export function generateProfile(context is Context, definition is map) returns BeamProfile
{
    var profile = definition->getGeneratedProfile();
    if (!(profile is map))
    {
        if (definition.profileType == ProfileType.MATCH)
        {
            if (context->evaluateQuery(definition.profileBeam) == [])
                throw regenError("Please select a beam for the profile.", ["profileBeam"]);

            profile = context->getBeamProfile(definition.profileBeam);
            if (profile == undefined)
                throw regenError("Selected part is not a beam.", ["profileBeam"], definition.profileBeam);
        }

        else if (definition.profileType == ProfileType.CUSTOM_SKETCH)
        {
            const profileData is PartStudioData = definition.profileData;
            if (profileData.buildFunction == undefined)
                throw regenError("Please select a custom profile.", ["profileData"]);

            const buildContext is Context = profileData.buildFunction(profileData.configuration);

            const sketchQ is Query = profileData.partQuery->qSketchFilter(SketchObject.YES);

            const isSelectedSketch is boolean = context->evaluateQuery(sketchQ) == context->evaluateQuery(definition.profileData.partQuery);

            const nElements = @size(buildContext->evaluateQuery(sketchQ));
            const lastId is Id = @resize(buildContext->lastModifyingOperationId(sketchQ->qNthElement(nElements - 1)), 1);

            var variable = try silent(buildContext->getVariable("-beamProfileSketchMap"));

            // Support older versions of the feature.
            if (variable == undefined)
                variable = try silent(buildContext->getVariable("beamProfileSketchMap"));

            profile = variable is map ? variable[lastId] : undefined;

            if (profile == undefined)
                throw regenError(isSelectedSketch
                        ? "Selected sketch is not a registered profile."
                        : "The last sketch in the feature list is not a registered profile.", ["profileData"]);

            profile = profile as BeamProfile;
        }

        else
            throw regenError("Could not compute profile.");
    }

    return profile;
}

// This function is an old function, but is just kept so that we can use it later if we decide to use a lookupTable
/*function getBeamLookupTable(table is map, path is LookupTablePath)
   {
   var out = {};
   while (table != undefined && table.entries != undefined && table.name != undefined)
   {
   const pathKey = path[table.name];
   const nextEntry = table.entries[pathKey];
   if (nextEntry == undefined)
   {
   return {};
   }
   if (!(nextEntry is map))
   {
   return nextEntry;
   }
   table = nextEntry;
   out = mergeMaps(out, nextEntry);
   out.name = pathKey;
   }
   return out;
   }*/

// originNumber is -1 to use the default. Any other value selects an origin from profile.extraOriginPoints if it is an array and originNumber < @size(profile.extraOriginPoints).
export function sketchProfile(context is Context, id is Id, profile is BeamProfile, flipYAxis is boolean, originNumber is number, offsetVec is Vector) returns map
{
    var edgeCount is number = 0;
    const profilePoints is array = profile.points;
    const profileUnits is ValueWithUnits = profile.units;
    const profileSequence is array = profile.sequence->splitIntoCharacters();

    const origin is Vector = (originNumber < 0 ||
                !(profile.extraOriginPoints is array) ||
                originNumber >= @size(profile.extraOriginPoints)) ?
        vector(0, 0) :
        vector(profile.extraOriginPoints[originNumber]);

    const sketch is Sketch = context->newSketchOnPlane(id + "s", {
                "sketchPlane" : plane(vector(-origin[0], flipYAxis ? origin[1] : -origin[1], 0) * profileUnits, Z_DIRECTION)
            });

    var sequenceNumber is number = 0;
    var lastSequence is string = "";
    // The flippedness of the profile does not matter whether the profile has allowFlip or not, since the origin points are done using it.
    profile.flipped = ((flipYAxis ? -1 : 1) * (profile.flipped == true ? -1 : 1)) == -1;
    const m is number = profile.allowFlip == false ? 1 : (profile.flipped ? -1 : 1);

    /*
       This is a simple parser for the profile sequence
       Here is a table of the profile sequence data and meanings:

       Char |    Meaning     | N | Comment
       -----|----------------|---|--------
       "-"  | Skip a point   | 2 | Stops connecting to previous points
       "L"  | Line           | 2 | Connects to previous lines or arcs
       "A"  | Arc            | 4 | Connects to previous lines or arcs
       "C"  | Circle         | 3 |
       "e"  | Elliptical arc | 8 | Does not connect to lines or arcs
       "E"  | Ellipse        | 6 |
     */

    for (var i = 0; i < @size(profileSequence) && sequenceNumber < @size(profilePoints); i += 1)
    {
        const profileSequenceChar is string = profileSequence[i];
        if (profileSequenceChar == "-")
        {
            sequenceNumber += 2;
        }

        else if (profileSequenceChar == "L")
        {
            if (!tolerantEquals(vector(profilePoints[sequenceNumber], m * profilePoints[sequenceNumber + 1]) * profileUnits, vector(profilePoints[sequenceNumber + 2], m * profilePoints[sequenceNumber + 3]) * profileUnits))

                try
                {
                    sketch->skLineSegment("line" ~ i, {
                                "start" : vector(profilePoints[sequenceNumber], m * profilePoints[sequenceNumber + 1]) * profileUnits + offsetVec,
                                "end" : vector(profilePoints[sequenceNumber + 2], m * profilePoints[sequenceNumber + 3]) * profileUnits + offsetVec
                            });
                    edgeCount += 1;
                }

            sequenceNumber += 2;
        }

        else if (profileSequenceChar == "A")
        {
            if (!tolerantEquals(vector(profilePoints[sequenceNumber], m * profilePoints[sequenceNumber + 1]) * profileUnits, vector(profilePoints[sequenceNumber + 4], m * profilePoints[sequenceNumber + 5]) * profileUnits))

                try
                {
                    sketch->skArc("arc" ~ i, {
                                "start" : vector(profilePoints[sequenceNumber], m * profilePoints[sequenceNumber + 1]) * profileUnits + offsetVec,
                                "mid" : vector(profilePoints[sequenceNumber + 2], m * profilePoints[sequenceNumber + 3]) * profileUnits + offsetVec,
                                "end" : vector(profilePoints[sequenceNumber + 4], m * profilePoints[sequenceNumber + 5]) * profileUnits + offsetVec
                            });
                    edgeCount += 1;
                }

            sequenceNumber += 4;
        }

        else if (profileSequenceChar == "C")
        {
            // If drawn after a line or arc, increment the counter, so that the center is drawn correctly
            if (lastSequence == "L" || lastSequence == "A" || lastSequence == "e")
                sequenceNumber += 2;

            if (!tolerantEquals(profilePoints[sequenceNumber + 2] * profileUnits, 0 * meter))
                try
                {
                    sketch->skCircle("circle" ~ i, {
                                "center" : vector(profilePoints[sequenceNumber], m * profilePoints[sequenceNumber + 1]) * profileUnits + offsetVec,
                                "radius" : profilePoints[sequenceNumber + 2] * profileUnits,
                            });
                    edgeCount += 1;
                }

            sequenceNumber += 3;
        }

        else if (profileSequenceChar == "e")
        {
            // If drawn after a line or arc, increment the counter, so that the center is drawn correctly
            if (lastSequence == "L" || lastSequence == "A" || lastSequence == "e")
                sequenceNumber += 2;

            // Check that the start and end are not the same
            if (!tolerantEquals(profilePoints[sequenceNumber + 6] * 2 * PI * radian, profilePoints[sequenceNumber + 7] * 2 * PI * radian))
                try
                {
                    sketch->skEllipticalArc("arc" ~ i, {
                                "center" : vector(profilePoints[sequenceNumber], m * profilePoints[sequenceNumber + 1]) * profileUnits + offsetVec,
                                "majorAxis" : vector(profilePoints[sequenceNumber + 2], m * profilePoints[sequenceNumber + 3])->normalize(),

                                "majorRadius" : profilePoints[sequenceNumber + 4] * profileUnits,
                                "minorRadius" : profilePoints[sequenceNumber + 5] * profileUnits,

                                "startParameter" : profile.flipped ? -profilePoints[sequenceNumber + 7] : profilePoints[sequenceNumber + 6],
                                "endParameter" : profile.flipped ? -profilePoints[sequenceNumber + 6] : profilePoints[sequenceNumber + 7]
                            });
                    edgeCount += 1;
                }

            sequenceNumber += 8;
        }

        else if (profileSequenceChar == "E")
        {
            // If drawn after a line or arc, increment the counter, so that the center is drawn correctly
            if (lastSequence == "L" || lastSequence == "A" || lastSequence == "e")
                sequenceNumber += 2;

            if (!tolerantEquals(profilePoints[sequenceNumber + 4] * profileUnits, 0 * meter) && !tolerantEquals(profilePoints[sequenceNumber + 5] * profileUnits, 0 * meter))
                try
                {
                    sketch->skEllipse("ellipse" ~ i, {
                                "center" : vector(profilePoints[sequenceNumber], m * profilePoints[sequenceNumber + 1]) * profileUnits + offsetVec,
                                "majorAxis" : vector(profilePoints[sequenceNumber + 2], m * profilePoints[sequenceNumber + 3])->normalize(),

                                "majorRadius" : profilePoints[sequenceNumber + 4] * profileUnits,
                                "minorRadius" : profilePoints[sequenceNumber + 5] * profileUnits,
                            });
                    edgeCount += 1;
                }

            sequenceNumber += 6;
        }

        else
            continue;

        lastSequence = profileSequenceChar;
    }

    sketch->skSolve();

    const evSketchQ is Query = context->evaluateQuery(qSketchRegion(id + "s", true))->qUnion();
    return {
            "q" : evSketchQ + context->startTrackingIdentity(evSketchQ),
            "profile" : profile,
            "edgeCount" : edgeCount
        };

}


FeatureScript 1420;

import(path : "onshape/std/properties.fs", version : "1420.0");
import(path : "onshape/std/units.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");

export type BeamProfile typecheck canBeBeamProfile;

export predicate canBeBeamProfile(value)
{
    value is map;

    /// This is the name of the profile.
    value.name is string;

    /// This is an array of points that define the profile, in combination
    /// with the sequence and units.
    value.points == undefined || value.points is array;
    if (value.points is array)
    {
        /// Each point is multiplied by this factor to get the correct units.
        /// By default, the units used are millimeters or meters (millimeters
        /// are used for the profile generators, and meters are used for custom
        /// profiles)
        isLength(value.units);

        /// This is a string that shows the sequence used for the points.
        /// See beamProfile.fs for examples of its use in the sketchProfile
        /// function.
        value.sequence is string;

        /// This is used to remember whether a profile was flipped or not.

        // TODO: Check whether this is actually needed, and if we can just
        // use the flipped option in the selection.
        // Unfortunately, this will end up breaking a lot of stuff if or when
        // this get changed.

        // I have allowed the flip arrow for everything, including profiles that
        // don't flip, since the profile points do.

        // What I can do is add a flipped option to the selection, then hide the
        // flip arrow and have new features default to not having the arrow
        // flipped. This would still need to be here to keep backward
        // compatibility, but that would be a lot better.

        // TODO: To change this, we may have to get a versioning scheme in place,
        // where each instance of the feature has a version associated with it,
        // much like how Onshape features use `isAtVersionOrLater` to use earlier
        // behaviour when breaking changes are introduced.
        value.flipped == undefined || value.flipped is boolean;
    }

    /// This is a list of vectors, each defining an extra point that can be
    /// chosen for an origin
    value.extraOriginPoints == undefined || value.extraOriginPoints is array;
    if (value.extraOriginPoints is array)
        for (var point in value.extraOriginPoints)
        {
            @size(point) == 2;
            point[0] is number;
            point[1] is number;
        }

    /// This is just data that can be used by other FS, like the beamEndCap FS.
    value.data == undefined || value.data is map;




    // These are constraints on the generated beam

    /// This is the maximum length (in m) of the created beam.
    value.maxLength == undefined || value.maxLength is number;

    /// This is the minimum radius (in m) of the created beam.
    ///
    /// Note: This is currently only checked on the original edge, and only
    /// for arcs.
    value.minRadius == undefined || value.minRadius is number;




    // These are properties of the generated beam

    /// This is the part number that will be assigned to the part when it is
    /// created.
    value.partNumber == undefined || value.partNumber is string;

    /// This is the material that will be assigned to the part when it is
    /// created.
    value.material == undefined || value.material is Material;

    /// This is the colour that will be assigned to the part when it is
    /// created.
    value.colour == undefined || value.colour is Color;
}

export enum ProfileType
{
    annotation { "Name" : "Steel" }
    STEEL,
    annotation { "Name" : "Stainless steel" }
    STAINLESS,
    annotation { "Name" : "Aluminium" }
    ALUMINIUM,
    annotation { "Name" : "Other" }
    SPECIAL,

    annotation { "Name" : "Custom" } // Custom profiles specifically for this feature
    CUSTOM_SKETCH,
    annotation { "Name" : "Match beam" } // Match another created beam
    MATCH
}

export enum SteelProfileType
{
    annotation { "Name" : "Equal Angle" }
    EQUAL_ANGLE,
    annotation { "Name" : "Unequal Angle" }
    UNEQUAL_ANGLE,

    annotation { "Name" : "Square Hollow Section (SHS)" }
    SHS,
    annotation { "Name" : "Rectangular Hollow Section (RHS)" }
    RHS,

    annotation { "Name" : "Tube" }
    TUBE,
    annotation { "Name" : "Pipe" }
    PIPE,

    annotation { "Name" : "Round Bar" }
    BAR_ROUND,
    annotation { "Name" : "Square Bar" }
    BAR_SQUARE,
    annotation { "Name" : "Flat Bar" }
    BAR_FLAT,
    annotation { "Name" : "Rydal Flat Bar" }
    BAR_RYDAL_FLAT,

    annotation { "Name" : "Parallel Flange Channel (PFC)" }
    PFC,

    annotation { "Name" : "Lysaght Zed" }
    LYSAGHT_ZED,
    annotation { "Name" : "Lysaght Cee" }
    LYSAGHT_CEE,

    // TODO: Welded beam
    // TODO: Welded column

    annotation { "Name" : "Universal Beam" }
    UNIVERSAL_BEAM,
    annotation { "Name" : "Universal Column" }
    UNIVERSAL_COLUMN,

    annotation { "Name" : "Taper Flange Beam" }
    TFB,

    annotation { "Name" : "Rail" }
    RAIL,

    // TODO: Universal Bearing Pile
}

export enum StainlessProfileType
{
    annotation { "Name" : "Square Hollow Section (SHS)" }
    SHS,
    annotation { "Name" : "Rectangular Hollow Section (RHS)" }
    RHS,

    annotation { "Name" : "Tube" }
    TUBE,
    annotation { "Name" : "Pipe" }
    PIPE,

    annotation { "Name" : "Round Bar" }
    BAR_ROUND,
    annotation { "Name" : "Square Bar" }
    BAR_SQUARE,
    annotation { "Name" : "Flat Bar" }
    BAR_FLAT,
}

export enum AluminiumProfileType
{
    annotation { "Name" : "Angle" }
    ANGLE,

    annotation { "Name" : "SHS / RHS" }
    SHS_RHS,

    annotation { "Name" : "Tube (CHS)" }
    CHS,

    annotation { "Name" : "Round Bar" }
    BAR_ROUND,
    annotation { "Name" : "Flat Bar" }
    BAR_FLAT,

    annotation { "Name" : "Channel" }
    CHANNEL,

    annotation { "Name" : "Tee" }
    TEE,
}

export enum SpecialProfileType
{
    annotation { "Name" : "Unistrut" }
    UNISTRUT,

    // TODO: Capral aluminium profiles
}



FeatureScript 1420;

import(path : "onshape/std/error.fs", version : "1420.0");
import(path : "onshape/std/math.fs", version : "1420.0");
import(path : "onshape/std/properties.fs", version : "1420.0");
import(path : "onshape/std/string.fs", version : "1420.0");
import(path : "onshape/std/units.fs", version : "1420.0");

import(path : "6fb34667b55a246e198a34ad", version : "c67f4998909bab6f0689030f");
export import(path : "403b508ffd9211178df8cfdf", version : "e6ba5764ef59df8deba00683");
export import(path : "3251a0e42432bc5ea9fb299b", version : "adc2c0d51097f2f9020db009");
export import(path : "a5cc8463b3c728bdc3a9d1fc", version : "472b09c7949ec7af63263944");

export function getGeneratedProfile(definition is map)
{
    var profile;
    var length;
    var minRadius;
    if (definition.profileType == ProfileType.ALUMINIUM)
    {
        // Aluminium is usually in 6.5m lengths
        length = 6.5;

        if (definition.aluminiumProfileType == AluminiumProfileType.ANGLE)
        {
            profile = generateAngleProfile({
                        "s1" : definition.aS1,
                        "s2" : definition.aS2,
                        "t" : definition.aT,
                        "r1" : definition.aR1,
                        "r2" : definition.aR2,
                        "material" : ALUMINIUM_MATERIAL
                    });
        }

        else if (definition.aluminiumProfileType == AluminiumProfileType.SHS_RHS)
        {
            profile = generateRHSProfile({
                        "l1" : definition.aS1,
                        "l2" : definition.aS2,
                        "t" : definition.aT,
                        "r1" : definition.aR1,
                        "r2" : definition.aR2,
                        "material" : ALUMINIUM_MATERIAL
                    });
        }

        else if (definition.aluminiumProfileType == AluminiumProfileType.CHS)
        {
            length = 7.3;
            minRadius = definition.aD / 1000 * 2; // Convert from mm -> meter
            profile = generateTubeProfile({
                        "od" : definition.aD,
                        "t" : definition.aT,
                        "material" : ALUMINIUM_MATERIAL
                    });
        }


        else if (definition.aluminiumProfileType == AluminiumProfileType.BAR_ROUND)
        {
            length = 4;
            profile = generateRoundBarProfile(definition.aD, ALUMINIUM_MATERIAL);
        }
        else if (definition.aluminiumProfileType == AluminiumProfileType.BAR_FLAT)
        {
            length = 6;
            profile = generateFlatBarProfile({
                        "w" : definition.aW,
                        "t" : definition.aT,
                        "material" : ALUMINIUM_MATERIAL
                    });
        }


        else if (definition.aluminiumProfileType == AluminiumProfileType.CHANNEL)
        {
            length = 6.5;
            profile = generateAlumChannelProfile({
                        "d" : definition.aS1,
                        "w" : definition.aS2,
                        "wT" : definition.aT2,
                        "fT" : definition.aT,
                        "iR" : definition.aR1,
                        "oR" : definition.aR2,
                        "eR" : definition.aR3
                    });
        }


        else if (definition.aluminiumProfileType == AluminiumProfileType.TEE)
        {
            length = 6.5;
            profile = generateAlumTeeProfile({
                        "d" : definition.aS1,
                        "w" : definition.aS2,
                        "wT" : definition.aT,
                        "fT" : definition.aT2,
                        "iR" : definition.aR1,
                        "oR" : definition.aR2
                    });
        }
        else
            throw regenError("Aluminium " ~ definition.aluminiumProfileType ~ " is not supported yet.", ["aluminiumProfileType"]);
    }
    else if (definition.profileType == ProfileType.STEEL)
    {
        if (definition.steelProfileType == SteelProfileType.EQUAL_ANGLE)
        {
            const result is map = definition.steelEqualAngle->match("_([0-9]+)_([0-9]+)");
            const s1 is number = stringToNumber(result.captures[1]);
            const r1 is number = switch (s1) {
                        25 : 5,
                        30 : 5,
                        40 : 5,
                        45 : 5,
                        50 : 6,
                        55 : 6,
                        65 : 6,
                        75 : 8,
                        90 : 8,
                        100 : 8,
                        125 : 10,
                        150 : 13,
                        200 : 18
                    };
            length = s1 <= 65 ? 9 : (s1 <= 100 ? 12 : 15);
            profile = generateAngleProfile({
                        "s1" : s1,
                        "s2" : s1,
                        "t" : stringToNumber(result.captures[2]),
                        "r1" : r1,
                        "r2" : s1 < 75 ? 3 : 5,
                        "material" : STEEL_MATERIAL
                    });
        }
        else if (definition.steelProfileType == SteelProfileType.UNEQUAL_ANGLE)
        {

            const result is map = definition.steelUnequalAngle->match("_([0-9]+)_([0-9]+)_([0-9]+)");
            const s1 is number = stringToNumber(result.captures[1]);
            length = s1 <= 75 ? 9 : (s1 <= 125 ? 12 : 15);
            profile = generateAngleProfile({
                        "s1" : s1,
                        "s2" : stringToNumber(result.captures[2]),
                        "t" : stringToNumber(result.captures[3]),
                        "r1" : 8,
                        "r2" : 5,
                        "material" : STEEL_MATERIAL
                    });
        }


        else if (definition.steelProfileType == SteelProfileType.SHS)
        {
            const result is map = definition.steelSHS->match("_([0-9]+)_([0-9]+)(?:_([0-9]+))?");
            const s is number = stringToNumber(result.captures[1]);
            const t is number = stringToNumber(result.captures[2] ~ "." ~ result.captures[3]);
            length = s >= 100 ? 12 : (s >= 30 ? 8 : 6.5);
            profile = generateRHSProfile({
                        "l1" : s,
                        "l2" : s,
                        "t" : t,
                        "material" : STEEL_MATERIAL
                    });
        }
        else if (definition.steelProfileType == SteelProfileType.RHS)
        {
            const result is map = definition.steelRHS->match("_([0-9]+)_([0-9]+)_([0-9]+)(?:_([0-9]+))?");
            const size1 is number = stringToNumber(result.captures[1]);
            const size2 is number = stringToNumber(result.captures[2]);
            const t is number = stringToNumber(result.captures[3] ~ "." ~ result.captures[4]);
            length = size1 >= 150 ? 12 : 8;
            profile = generateRHSProfile({
                        "l1" : size1,
                        "l2" : size2,
                        "t" : t,
                        "material" : STEEL_MATERIAL
                    });
        }


        else if (definition.steelProfileType == SteelProfileType.TUBE)
        {
            const result is map = definition.steelTube->match("_([0-9]+)_([0-9]+)_([0-9]+)_([0-9]+)");
            const od is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            const t is number = stringToNumber(result.captures[3] ~ "." ~ result.captures[4]);
            length = 6.1;
            minRadius = od / 1000 * 2; // Convert from mm -> meter
            profile = generateTubeProfile({
                        "od" : od,
                        "t" : t,
                        "material" : STEEL_MATERIAL
                    });
        }
        else if (definition.steelProfileType == SteelProfileType.PIPE)
        {
            const result is map = definition.steelPipe->match("_([0-9]+)_([0-9]+)_([0-9]+)(?:_([0-9]+))?");
            const od is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            const t is number = stringToNumber(result.captures[3] ~ "." ~ result.captures[4]);
            const nb is number = switch (od) {
                        13.5 : 8,
                        17.2 : 10,
                        21.3 : 15,
                        26.9 : 20,
                        33.7 : 25,
                        42.4 : 32,
                        48.3 : 40,
                        60.3 : 50,
                        76.1 : 65,
                        88.9 : 80,
                        101.6 : 90,
                        114.3 : 100,
                        139.7 : 125,
                        141.3 : 125,
                        165.1 : 150,
                        168.3 : 150,
                        219.1 : 200,
                        273.1 : 250,
                        323.9 : 300,
                        355.6 : 350,
                        406.4 : 400,
                        457.0 : 450,
                        508.0 : 500,
                        610.0 : 600,
                        660.0 : 650,
                        711.0 : 700,
                        762.0 : 750,
                    };
            length = 6.5;
            minRadius = od / 1000 * 2; // Convert from mm -> meter
            profile = generateSteelPipeProfile({
                        "od" : od,
                        "t" : t,
                        "nb" : nb,
                        "material" : STEEL_MATERIAL
                    });
        }


        else if (definition.steelProfileType == SteelProfileType.BAR_ROUND)
        {
            const result is map = definition.steelRoundBar->match("_([0-9]+)(?:_([0-9]+))?");
            const size is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            length = 6;
            profile = generateRoundBarProfile(size, STEEL_MATERIAL);
        }
        else if (definition.steelProfileType == SteelProfileType.BAR_SQUARE)
        {
            const result is map = definition.steelSquareBar->match("_([0-9]+)(?:_([0-9]+))?");
            const size is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            // const radius = switch (size) {
            //             45 : 5.5,
            //             50 : 6.5,
            //             63 : 8,
            //             75 : 9.5,
            //             90 : 11.5,
            //             100 : 12.5
            //         };
            length = 3.5;
            // if (radius is number)
            //     profile = generateFilletedSquareBarProfile(size, radius, STEEL_MATERIAL);
            // else
            profile = generateSquareBarProfile(size, STEEL_MATERIAL);
        }
        else if (definition.steelProfileType == SteelProfileType.BAR_FLAT)
        {
            const result is map = definition.steelFlatBar->match("_([0-9]+)_([0-9]+)");
            const width is number = stringToNumber(result.captures[1]);
            const height is number = stringToNumber(result.captures[2]);
            length = 6;
            profile = generateFlatBarProfile({
                        "w" : width,
                        "t" : height,
                        "material" : STEEL_MATERIAL
                    });
        }
        else if (definition.steelProfileType == SteelProfileType.BAR_RYDAL_FLAT)
        {
            const result is map = definition.steelRydalFlatBar->match("_([0-9]+)_([0-9]+)");
            const width is number = stringToNumber(result.captures[1]);
            const height is number = stringToNumber(result.captures[2]);
            length = 6;
            profile = generateSteelRydalFlatBarProfile({
                        "w" : width,
                        "t" : height,
                    });
        }


        else if (definition.steelProfileType == SteelProfileType.PFC)
        {
            const params is map = getSteelPFCParams(definition.steelPFC);
            length = params.d <= 75 ? 9 : (params.d <= 125 ? 12 : (params.d <= 230 ? 15 : 16.5));
            profile = generateSteelPFCProfile(params);
        }


        else if (definition.steelProfileType == SteelProfileType.LYSAGHT_ZED)
        {
            const params is map = getSteelLysaghtZedParams(definition.steelLysaghtZed);
            length = 12;
            profile = generateSteelLysaghtZedProfile(params);
        }
        else if (definition.steelProfileType == SteelProfileType.LYSAGHT_CEE)
        {
            const params is map = getSteelLysaghtCeeParams(definition.steelLysaghtCee);
            length = 12;
            profile = generateSteelLysaghtCeeProfile(params);
        }


        else if (definition.steelProfileType == SteelProfileType.UNIVERSAL_BEAM)
        {
            const params is map = getSteelUBParams(definition.steelUniversalBeam);
            // 150 UB, 180 UB and 200 UB 18.2 (198h)
            length = params.d <= 200 ? 16.5 : 18;
            profile = generateSteelUBProfile(params);
        }
        else if (definition.steelProfileType == SteelProfileType.UNIVERSAL_COLUMN)
        {
            const params is map = getSteelUCParams(definition.steelUniversalColumn);
            length = params.d <= 100 ? 16.5 : 18;
            profile = generateSteelUBProfile(params);
        }


        else if (definition.steelProfileType == SteelProfileType.TFB)
        {
            const params is map = getSteelTFBParams(definition.steelTFB);
            length = 12;
            profile = generateSteelTFBProfile(params);
        }


        else if (definition.steelProfileType == SteelProfileType.RAIL)
        {
            profile = getSteelRailProfile(definition.steelRail);
        }

        else
            throw regenError("Steel " ~ definition.steelProfileType ~ " is not supported yet.", ["steelProfileType"]);
    }
    else if (definition.profileType == ProfileType.STAINLESS)
    {
        if (definition.stainlessProfileType == StainlessProfileType.SHS)
        {
            const result is map = definition.stainlessSHS->match("_([0-9]+)_([0-9]+)_([0-9]+)(?:_([0-9]+))?");
            const s is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            const t is number = stringToNumber(result.captures[3] ~ "." ~ result.captures[4]);
            length = 6;
            profile = generateRHSProfile({
                        "l1" : s,
                        "l2" : s,
                        "t" : t,
                        "r1" : 0,
                        "r2" : t,
                        "material" : STAINLESS_MATERIAL
                    });
        }
        else if (definition.stainlessProfileType == StainlessProfileType.RHS)
        {
            const result is map = definition.stainlessRHS->match("_([0-9]+)_([0-9]+)_([0-9]+)_([0-9]+)_([0-9]+)(?:_([0-9]+))?");
            const size1 is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            const size2 is number = stringToNumber(result.captures[3] ~ "." ~ result.captures[4]);
            const t is number = stringToNumber(result.captures[5] ~ "." ~ result.captures[6]);
            length = 6;
            profile = generateRHSProfile({
                        "l1" : size1,
                        "l2" : size2,
                        "t" : t,
                        "r1" : 0,
                        "r2" : t,
                        "material" : STAINLESS_MATERIAL
                    });
        }


        else if (definition.stainlessProfileType == StainlessProfileType.TUBE)
        {
            const result is map = definition.stainlessTube->match("_([0-9]+)_([0-9]+)_([0-9]+)_([0-9]+)");
            const od is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            const t is number = stringToNumber(result.captures[3] ~ "." ~ result.captures[4]);
            length = 6;
            profile = generateTubeProfile({
                        "od" : od,
                        "t" : t,
                        "material" : STAINLESS_MATERIAL
                    });
        }
        else if (definition.stainlessProfileType == StainlessProfileType.PIPE)
        {
            const result is map = definition.stainlessPipe->match("_([0-9]+)_([0-9]+)_([0-9]+)_([0-9]+)_([0-9]+)");

            const nb is number = stringToNumber(result.captures[1]);
            const od is number = stringToNumber(result.captures[2] ~ "." ~ result.captures[3]);
            const t is number = stringToNumber(result.captures[4] ~ "." ~ result.captures[5]);

            length = 6.1;
            profile = generateSteelPipeProfile({
                        "od" : od,
                        "nb" : nb,
                        "t" : t,
                        "material" : STAINLESS_MATERIAL
                    });
        }
        else if (definition.stainlessProfileType == StainlessProfileType.BAR_ROUND)
        {
            const result is map = definition.stainlessRoundBar->match("_([0-9]+)(?:_([0-9]+))?");
            const sizeNum is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            length = 6;
            profile = generateRoundBarProfile(sizeNum, STAINLESS_MATERIAL);
        }
        else if (definition.stainlessProfileType == StainlessProfileType.BAR_SQUARE)
        {
            const result is map = definition.stainlessSquareBar->match("_([0-9]+)(?:_([0-9]+))?");
            const sizeNum is number = stringToNumber(result.captures[1] ~ "." ~ result.captures[2]);
            length = 5;
            profile = generateSquareBarProfile(sizeNum, STAINLESS_MATERIAL);
        }
        else if (definition.stainlessProfileType == StainlessProfileType.BAR_FLAT)
        {
            const result is map = definition.stainlessFlatBar->match("_([0-9]+)_([0-9]+)");
            const width is number = stringToNumber(result.captures[1]);
            const height is number = stringToNumber(result.captures[2]);
            length = 5;
            profile = generateFlatBarProfile({
                        "w" : width,
                        "t" : height,
                        "material" : STAINLESS_MATERIAL
                    });
        }

        else
            throw regenError("Stainless steel " ~ definition.stainlessProfileType ~ " is not supported yet.", ["stainlessProfileType"]);
    }
    else if (definition.profileType == ProfileType.SPECIAL)
    {
        if (definition.specialProfileType == SpecialProfileType.UNISTRUT)
        {
            const params is map = getSpecialUnistrutParams(definition.specialUnistrut);
            length = 6;
            profile = switch (params.ty) {
                        (undefined) : generateSpecialUnistrutProfile(params),
                        (1) : generateSpecialUnistrutOneGrooveProfile(params),
                        (2) : generateSpecialUnistrutTwoGrooveProfile(params),
                    };
        }

        else
            throw regenError("Special profile " ~ definition.stainlessProfileType ~ " is not supported yet.", ["specialProfileType"]);
    }
    else
        return;
    if (length != undefined)
        profile.maxLength = length;
    profile.minRadius = minRadius;
    return profile as BeamProfile;
}

const STEEL_MATERIAL is Material = material("Mild Steel", 7850 * kilogram / meter ^ 3);
const STAINLESS_MATERIAL is Material = material("Stainless Steel", 7850 * kilogram / meter ^ 3);
const ALUMINIUM_MATERIAL is Material = material("Aluminium", 2700 * kilogram / meter ^ 3);

/*
   The functions below are as follows:

   Steel + Aluminium (generate<type>Profile): {

   Angle
   RHS
   Tube
   RoundBar
   SquareBar
   FilletedSquareBar
   FlatBar

   }

   Aluminium (generateAlum<type>Profile): {

   Channel // This function is like the Steel PFC one, but it has different ids for each face, meaning that it can't be made a single function without breakage
   Tee

   }

   Steel (generateSteel<type>Profile): {

   Pipe
   PFC
   LysaghtZed
   LysaghtCee
   UB // This is also used for universal column
   TFB

   }

   Special (generateSpecial<type>Profile): {

   Unistrut // Simple unistruct, no  grooves
   UnistrutOneGroove
   UnistrutTwoGroove

   }
 */
function generateAngleProfile(params is map) returns map
{
    const l1 is number = params.s1;
    const l2 is number = params.s2;
    const r1 is number = params.r1;
    const r2 is number = params.r2;
    const t is number = params.t;
    const checkNum is number = max(l1, l2);
    const arcDist1 is number = r1 - sqrt((r1 ^ 2) / 2);
    const arcDist2 is number = r2 - sqrt((r2 ^ 2) / 2);
    return {
            "sequence" : "LLALALALL",
            "units" : millimeter,
            "points" : [
                    // L1 side
                    0, 0,
                    0, l1,
                    t - r2, l1,
                    t - arcDist2, l1 - arcDist2,
                    t, l1 - r2,
                    // Center arc
                    t, t + r1,
                    t + arcDist1, t + arcDist1,
                    t + r1, t,
                    // L2 side
                    l2 - r2, t,
                    l2 - arcDist2, t - arcDist2,
                    l2, t - r2,
                    l2, 0,
                    0, 0
                ],
            "name" : max(l1, l2) ~ " x " ~ min(l1, l2) ~ " x " ~ t ~ " Angle",
            "material" : params.material,
            "extraOriginPoints" : [
                    [0, l1],

                    [t, l1],
                    [t, t],

                    [l2, t],
                    [l2, 0],
                    [l2, l1],

                    // Centerpoints along edges and in the middle

                    [0, l1 / 2],

                    [l2 / 2, 0],
                    [l2 / 2, l1 / 2],
                    [l2 / 2, l1],

                    [l2, l1 / 2],
                ],
            "data" : params
        };
}

function generateRHSProfile(params is map) returns map
{
    const l1 is number = params.l1;
    const l2 is number = params.l2;
    const t is number = params.t;
    const iR is number = params.r1 == undefined ? t : params.r1;
    const oR is number = params.r2 == undefined ? t * 2 : params.r2;
    params.r1 = iR;
    params.r2 = oR;

    const s1 is number = l1 / 2;
    const s2 is number = l2 / 2;
    const iS1 is number = s1 - t; // Inner length 1
    const iS2 is number = s2 - t; // Inner length 2
    const oRDist is number = oR - sqrt((oR ^ 2) / 2);
    const iRDist is number = iR - sqrt((iR ^ 2) / 2);

    return {
            "sequence" : "LALALALA-ALALALAL",
            "units" : millimeter,
            "points" : [
                    // Outside
                    s1 - oR, s2,
                    oR - s1, s2,
                    -(s1 - oRDist), (s2 - oRDist),
                    -s1, s2 - oR,
                    -s1, oR - s2,
                    -(s1 - oRDist), -(s2 - oRDist),
                    oR - s1, -s2,
                    s1 - oR, -s2,
                    (s1 - oRDist), -(s2 - oRDist),
                    s1, oR - s2,
                    s1, s2 - oR,
                    (s1 - oRDist), (s2 - oRDist),
                    s1 - oR, s2,

                    // Inside
                    iS1, iS2 - iR,
                    (iS1 - iRDist), (iS2 - iRDist),
                    iS1 - iR, iS2,
                    iR - iS1, iS2,
                    -(iS1 - iRDist), (iS2 - iRDist),
                    -iS1, iS2 - iR,
                    -iS1, iR - iS2,
                    -(iS1 - iRDist), -(iS2 - iRDist),
                    iR - iS1, -iS2,
                    iS1 - iR, -iS2,
                    (iS1 - iRDist), -(iS2 - iRDist),
                    iS1, iR - iS2,
                    iS1, iS2 - iR
                ],
            "name" : max(l1, l2) ~ " x " ~ min(l1, l2) ~ " x " ~ t ~ (l1 == l2 ? " SHS" : " RHS"),
            "material" : params.material,
            "extraOriginPoints" : [
                    [-s1, -s2],
                    [-s1, 0],
                    [-s1, s2],

                    [0, -s2],
                    [0, s2],

                    [s1, -s2],
                    [s1, 0],
                    [s1, s2],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

function generateTubeProfile(params is map) returns map
{
    const r is number = params.od / 2;

    return {
            "sequence" : "CC",
            "units" : millimeter,
            "points" : [
                    0, 0, r,
                    0, 0, r - params.t
                ],
            "name" : params.od ~ " x " ~ params.t ~ " Tube",
            "material" : params.material,
            "extraOriginPoints" : [
                    [-r, -r],
                    [-r, 0],
                    [-r, r],

                    [0, -r],
                    [0, r],

                    [r, -r],
                    [r, 0],
                    [r, r],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

function generateRoundBarProfile(s is number, material is Material) returns map
{
    const r is number = s / 2;
    return {
            "sequence" : "C",
            "units" : millimeter,
            "points" : [
                    0, 0, r
                ],
            "name" : s ~ " mm Round Bar",
            "material" : material,
            "extraOriginPoints" : [
                    [-r, -r],
                    [-r, 0],
                    [-r, r],

                    [0, -r],
                    [0, r],

                    [r, -r],
                    [r, 0],
                    [r, r],
                ],
            "allowFlip" : false,
            "data" : { "s" : s }
        };
}

function generateSquareBarProfile(s is number, material is Material) returns map
{
    const r is number = s / 2;
    return {
            "sequence" : "LLLL",
            "units" : millimeter,
            "points" : [
                    -r, -r,
                    -r, r,
                    r, r,
                    r, -r,
                    -r, -r
                ],
            "name" : s ~ " mm Square Bar",
            "material" : material,
            "extraOriginPoints" : [
                    [-r, -r],
                    [-r, 0],
                    [-r, r],

                    [0, -r],
                    [0, r],

                    [r, -r],
                    [r, 0],
                    [r, r],
                ],
            "allowFlip" : false,
            "data" : { "s" : s }
        };
}

function generateFilletedSquareBarProfile(s is number, f is number, material is Material) returns map
{
    const r is number = s / 2;
    const fd is number = r - (f - sqrt((f ^ 2) / 2));
    const rmf is number = r - f;
    return {
            "sequence" : "LALALALA",
            "units" : millimeter,
            "points" : [
                    // Left side
                    -r, -rmf,
                    -r, rmf,
                    // Top left arc
                    -fd, fd,
                    // Top
                    -rmf, r,
                    rmf, r,
                    // Top right arc
                    fd, fd,
                    // Right
                    r, rmf,
                    r, -rmf,
                    // Bottom right arc
                    fd, -fd,
                    // Bottom
                    rmf, -r,
                    -rmf, -r,
                    // Bottom left arc
                    -fd, -fd,
                    // End
                    -r, -rmf
                ],
            "name" : s ~ " mm Square Bar",
            "material" : material,
            "extraOriginPoints" : [
                    [-r, -r],
                    [-r, 0],
                    [-r, r],

                    [0, -r],
                    [0, r],

                    [r, -r],
                    [r, 0],
                    [r, r],
                ],
            "allowFlip" : false,
            "data" : { "s" : s, "f" : f }
        };
}

function generateFlatBarProfile(params is map) returns map
{
    const hT is number = params.t / 2;
    const hW is number = params.w / 2;
    return {
            "sequence" : "LLLL",
            "units" : millimeter,
            "points" : [
                    -hW, -hT,
                    -hW, hT,
                    hW, hT,
                    hW, -hT,
                    -hW, -hT
                ],
            "name" : params.w ~ " x " ~ params.t ~ " Flat Bar",
            "material" : params.material,
            "extraOriginPoints" : [
                    [-hW, -hT],
                    [-hW, 0],
                    [-hW, hT],

                    [0, -hT],
                    [0, hT],

                    [hW, -hT],
                    [hW, 0],
                    [hW, hT],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

//================ Aluminium generators ================//

function generateAlumChannelProfile(params is map) returns map
{
    const hd is number = params.d / 2;
    const w is number = params.w;

    const wT is number = params.wT;
    const fT is number = params.fT;

    const iR is number = params.iR;
    const iRDist is number = iR - sqrt((iR ^ 2) / 2);
    const oR is number = params.oR;
    const oRDist is number = oR - sqrt((oR ^ 2) / 2);

    const eR is number = params.eR;
    const eRDist is number = eR - sqrt((eR ^ 2) / 2);
    return {
            "sequence" : "ALALALALALALALAL",
            "units" : millimeter,
            "points" : [
                    // Top
                    0, hd - oR,
                    oRDist, hd - oRDist,
                    oR, hd,
                    w - eR, hd,
                    w - eRDist, hd - eRDist,
                    w, hd - eR,
                    w, hd - fT + eR,
                    w - eRDist, hd - fT + eRDist,
                    w - eR, hd - fT,
                    wT + iR, hd - fT,
                    wT + iRDist, hd - fT - iRDist,
                    wT, hd - fT - iR,

                    // Bottom
                    wT, -hd + fT + iR,
                    wT + iRDist, -hd + fT + iRDist,
                    wT + iR, -hd + fT,
                    w - eR, -hd + fT,
                    w - eRDist, -hd + fT - eRDist,
                    w, -hd + fT - eR,
                    w, -hd + eR,
                    w - eRDist, -hd + eRDist,
                    w - eR, -hd,
                    oR, -hd,
                    oRDist, -hd + oRDist,
                    0, -hd + oR,
                    0, hd - oR,
                ],
            "name" : params.d ~ " x " ~ params.w ~ " x " ~ fT ~ (fT != params.wT ? " x " ~ params.wT : "") ~ " Channel",
            "material" : ALUMINIUM_MATERIAL,
            "extraOriginPoints" : [
                    [0, -hd],
                    [0, hd],

                    [w / 2, -hd],
                    [w / 2, 0],
                    [w / 2, hd],

                    [w, -hd],
                    [w, -hd + fT],
                    [w, 0],
                    [w, hd - fT],
                    [w, hd],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

function generateAlumTeeProfile(params is map) returns map
{
    const hd is number = params.d / 2;
    const hw is number = params.w / 2;
    const hwT is number = params.wT / 2;

    const iR is number = params.iR;
    const iRDist is number = iR - sqrt((iR ^ 2) / 2);
    const oR is number = params.oR;
    const oRDist is number = oR - sqrt((oR ^ 2) / 2);

    const fT is number = params.fT;

    return {
            "sequence" : "LLALALLLALAL",
            "units" : millimeter,
            "points" : [
                    // Top
                    -hw, hd,
                    hw, hd,

                    // Right
                    hw, hd - fT + oR,
                    hw - oRDist, hd - fT + oRDist,
                    hw - oR, hd - fT,
                    hwT + iR, hd - fT,
                    hwT + iRDist, hd - fT - iRDist,
                    hwT, hd - fT - iR,
                    hwT, -hd,

                    // Left
                    -hwT, -hd,
                    -hwT, hd - fT - iR,
                    -hwT - iRDist, hd - fT - iRDist,
                    -hwT - iR, hd - fT,
                    -hw + oR, hd - fT,
                    -hw + oRDist, hd - fT + oRDist,
                    -hw, hd - fT + oR,
                    -hw, hd,
                ],
            "name" : params.d ~ " x " ~ params.w ~ " x " ~ fT ~ (fT != params.wT ? " x " ~ params.wT : "") ~ " Tee",
            "material" : ALUMINIUM_MATERIAL,
            "extraOriginPoints" : [
                    [-hw, -hd],
                    [-hw, hd - fT],
                    [-hw, hd],

                    [-hwT, -hd],
                    [-hwT, hd - fT],

                    [0, -hd],
                    [0, hd],

                    [hwT, -hd],
                    [hwT, hd - fT],

                    [hw, -hd],
                    [hw, hd - fT],
                    [hw, hd],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

//================ Steel generators ================//

function generateSteelPipeProfile(params is map) returns map
{
    const r is number = params.od / 2;

    return {
            "sequence" : "CC",
            "units" : millimeter,
            "points" : [
                    0, 0, r,
                    0, 0, r - params.t
                ],
            "name" : params.od ~ " x " ~ params.t ~ " Pipe (" ~ params.nb ~ " NB)",
            "material" : params.material,
            "extraOriginPoints" : [
                    [-r, -r],
                    [-r, 0],
                    [-r, r],

                    [0, -r],
                    [0, r],

                    [r, -r],
                    [r, 0],
                    [r, r],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

function generateSteelRydalFlatBarProfile(params is map) returns map
{
    const hT is number = params.t / 2;
    const hW is number = params.w / 2;
    return {
            "sequence" : "ALAL",
            "units" : millimeter,
            "points" : [
                    -hW + 1, -hT,
                    -hW, 0,
                    -hW + 1, hT,
                    hW - 1, hT,
                    hW, 0,
                    hW - 1, -hT,
                    -hW + 1, -hT,
                ],
            "name" : params.w ~ " x " ~ params.t ~ " Rydal Flat Bar",
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [-hW, -hT],
                    [-hW, 0],
                    [-hW, hT],

                    [0, -hT],
                    [0, hT],

                    [hW, -hT],
                    [hW, 0],
                    [hW, hT],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

function generateSteelPFCProfile(params is map) returns map
{
    const hd is number = params.d / 2;
    const w is number = params.w;

    const fT is number = params.fT;
    const wT is number = params.wT;

    const r is number = params.iR;
    const rDist is number = r - sqrt((r ^ 2) / 2);
    return {
            "sequence" : "LLLALALLLL",
            "units" : millimeter,
            "points" : [
                    // Upper
                    0, hd,
                    w, hd,
                    w, hd - fT,
                    wT + r, hd - fT,
                    wT + rDist, hd - fT - rDist,
                    wT, hd - fT - r,

                    // Lower
                    wT, -hd + fT + r,
                    wT + rDist, -hd + fT + rDist,
                    wT + r, -hd + fT,
                    w, -hd + fT,
                    w, -hd,
                    0, -hd,
                    0, hd
                ],
            "name" : params.d ~ " PFC",
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [0, -hd],
                    [0, hd],

                    [w / 2, -hd],
                    [w / 2, 0],
                    [w / 2, hd],

                    [w, -hd],
                    [w, -hd + fT],
                    [w, 0],
                    [w, hd - fT],
                    [w, hd],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

function generateSteelLysaghtZedProfile(params is map) returns map
{
    const t is number = params.t;
    const ht is number = t / 2;

    const hd is number = params.d / 2;

    const elht is number = params.e - ht;
    const flht is number = -(params.f - ht);

    const rIDist is number = 5 - sqrt((5 ^ 2) / 2);
    const rODist is number = 5 + t - sqrt(((5 + t) ^ 2) / 2);

    const l is number = params.l;

    const hx is number = params.x / 2;

    return {
            "sequence" : "LALALLLALALALALLLALA",
            "units" : millimeter,
            "points" : [
                    // Right side
                    ht, hd - t - 5,
                    ht, -hd + t + 5,
                    // Arc
                    ht + rIDist, -hd + t + rIDist,
                    // Bottom upper
                    ht + 5, -hd + t,
                    elht - t - 5, -hd + t,
                    // Arc
                    elht - t - rIDist, -hd + t + rIDist,
                    // Bottom right
                    elht - t, -hd + t + 5,
                    elht - t, -hd + l,
                    elht, -hd + l,
                    elht, -hd + t + 5,
                    // Arc
                    elht - rODist, -hd + rODist,
                    // Bottom lower
                    elht - t - 5, -hd,
                    ht + 5, -hd,
                    // Arc
                    -ht + rODist, -hd + rODist,
                    // Left side
                    -ht, -hd + t + 5,
                    -ht, hd - t - 5,

                    // Arc
                    -ht - rIDist, hd - t - rIDist,
                    // Top lower
                    -ht - 5, hd - t,
                    flht + t + 5, hd - t,
                    // Arc
                    flht + t + rIDist, hd - t - rIDist,
                    // Top left
                    flht + t, hd - t - 5,
                    flht + t, hd - l,
                    flht, hd - l,
                    flht, hd - t - 5,
                    // Arc
                    flht + rODist, hd - rODist,
                    // Top upper
                    flht + t + 5, hd,
                    -ht - 5, hd,
                    // Arc
                    ht - rODist, hd - rODist,
                    // End
                    ht, hd - t - 5,
                ],
            "name" : params.desig,
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [flht, hd],
                    [flht, 0],
                    [flht, -hd],

                    [0, hx],
                    [0, -hx],

                    [elht, hd],
                    [elht, 0],
                    [elht, -hd],

                    [-ht, hx],
                    [-ht, 0],
                    [-ht, -hx],

                    [ht, hx],
                    [ht, 0],
                    [ht, -hx],

                    [-ht, -hd],
                    [ht, hd],
                ],
            "data" : params
        };
}

function generateSteelLysaghtCeeProfile(params is map) returns map
{
    const t is number = params.t;

    const hd is number = params.d / 2;

    const b is number = params.b;

    // const elht is number = params.e - ht;
    // const flht is number = -(params.f - ht);

    const rIDist is number = 5 - sqrt((5 ^ 2) / 2);
    const rODist is number = 5 + t - sqrt(((5 + t) ^ 2) / 2);

    const l is number = params.l;

    const hx is number = params.x / 2;

    return {
            "sequence" : "LALALLLALALALALLLALA",
            "units" : millimeter,
            "points" : [
                    // left inner
                    t, hd - t - 5,
                    t, -hd + t + 5,
                    // Arc
                    t + rIDist, -hd + t + rIDist,
                    // Bottom upper
                    t + 5, -hd + t,
                    b - t - 5, -hd + t,
                    // Arc
                    b - t - rIDist, -hd + t + rIDist,
                    // Bottom right
                    b - t, -hd + t + 5,
                    b - t, -hd + l,
                    b, -hd + l,
                    b, -hd + t + 5,
                    // Arc
                    b - rODist, -hd + rODist,
                    // Bottom lower
                    b - t - 5, -hd,
                    t + 5, -hd,
                    // Arc
                    rODist, -hd + rODist,
                    // Left outer
                    0, -hd + t + 5,
                    0, hd - t - 5,
                    // Arc
                    rODist, hd - rODist,
                    // Top upper
                    t + 5, hd,
                    b - t - 5, hd,
                    // Arc
                    b - rODist, hd - rODist,
                    // Top right
                    b, hd - t - 5,
                    b, hd - l,
                    b - t, hd - l,
                    b - t, hd - t - 5,
                    // Arc
                    b - t - rIDist, hd - t - rIDist,
                    // Top lower
                    b - t - 5, hd - t,
                    t + 5, hd - t,
                    // Arc
                    t + rIDist, hd - t - rIDist,
                    // End
                    t, hd - t - 5
                ],
            "name" : params.desig,
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [0, hd],
                    [0, hx],
                    [0, -hx],
                    [0, -hd],

                    [b / 2, hd],
                    [b / 2, 0],
                    [b / 2, -hd],

                    [b, hd],
                    [b, 0],
                    [b, -hd],
                ],
            "data" : params,
            "allowFlip" : false
        };
}

function generateSteelUBProfile(params is map) returns map
{
    const hw is number = params.w / 2;
    const hd is number = params.d / 2;
    const hwt is number = params.wT / 2;
    const r is number = params.r;
    const fT is number = params.fT;
    const rDist is number = r - sqrt((r ^ 2) / 2);

    return {
            "sequence" : "LLLALALLLLLALALL",
            "units" : millimeter,
            "points" : [
                    // Top
                    -hw, hd,
                    hw, hd,

                    // Upper right
                    hw, hd - fT,
                    hwt + r, hd - fT,
                    hwt + rDist, hd - fT - rDist,
                    hwt, hd - fT - r,

                    // Lower right
                    hwt, -hd + fT + r,
                    hwt + rDist, -hd + fT + rDist,
                    hwt + r, -hd + fT,
                    hw, -hd + fT,

                    // Bottom
                    hw, -hd,
                    -hw, -hd,

                    // Lower Left
                    -hw, -hd + fT,
                    -hwt - r, -hd + fT,
                    -hwt - rDist, -hd + fT + rDist,
                    -hwt, -hd + fT + r,
                    // Upper left
                    -hwt, hd - fT - r,
                    -hwt - rDist, hd - fT - rDist,
                    -hwt - r, hd - fT,
                    -hw, hd - fT,
                    -hw, hd,
                ],
            "name" : params.desig,
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [-hw, -hd],
                    [-hw, -hd + fT],
                    [-hw, 0],
                    [-hw, hd - fT],
                    [-hw, hd],

                    [0, -hd],
                    [0, hd],

                    [hw, -hd],
                    [hw, -hd + fT],
                    [hw, 0],
                    [hw, hd - fT],
                    [hw, hd],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

function generateSteelTFBProfile(params is map) returns map
{
    const hd is number = params.d / 2;
    const hw is number = params.w / 2;

    const fT is number = params.fT;
    const hwT is number = params.wT / 2;

    const iR is number = params.r1;
    const iRDist is number = sqrt((iR ^ 2) / 2);
    const oR is number = params.r2;
    const oRDist is number = sqrt((oR ^ 2) / 2);

    const tan8 is number = tan(8 * degree);
    const cos8 is number = cos(8 * degree);
    const sin8 is number = sin(8 * degree);

    // Coordinates for the inner arc

    // This is also the y-coordinate of the centerpoint
    const iRLowerY is number = hd - fT - ((hw - hwT) / 2 - iR) * tan8 - iR / cos8;

    const iRUpperX is number = hwT + iR - iR * sin8;
    const iRUpperY is number = iRLowerY + iR * cos8;

    const iRMidX is number = hwT + iR - iRDist;
    const iRMidY is number = iRLowerY + iRDist;

    // Coordinates for the outer arc

    // This is also the y-coordinate of the centerpoint
    const oRUpperY is number = hd - fT + ((hw - hwT) / 2 - oR) * tan8 + oR / cos8;

    const oRLowerX is number = hw - oR + oR * sin8;
    const oRLowerY is number = oRUpperY - oR * cos8;

    const oRMidX is number = hw - oR + oRDist;
    const oRMidY is number = oRUpperY - oRDist;

    return {
            "sequence" : "LLALALALALLLALALALAL",
            "units" : millimeter,
            "points" : [
                    // Top
                    -hw, hd,
                    hw, hd,

                    // Upper right
                    hw, oRUpperY,
                    oRMidX, oRMidY,
                    oRLowerX, oRLowerY,
                    iRUpperX, iRUpperY,
                    iRMidX, iRMidY,
                    hwT, iRLowerY,

                    // Lower right
                    hwT, -iRLowerY,
                    iRMidX, -iRMidY,
                    iRUpperX, -iRUpperY,
                    oRLowerX, -oRLowerY,
                    oRMidX, -oRMidY,
                    hw, -oRUpperY,

                    // Bottom
                    hw, -hd,
                    -hw, -hd,

                    // Lower left
                    -hw, -oRUpperY,
                    -oRMidX, -oRMidY,
                    -oRLowerX, -oRLowerY,
                    -iRUpperX, -iRUpperY,
                    -iRMidX, -iRMidY,
                    -hwT, -iRLowerY,

                    // Upper left
                    -hwT, iRLowerY,
                    -iRMidX, iRMidY,
                    -iRUpperX, iRUpperY,
                    -oRLowerX, oRLowerY,
                    -oRMidX, oRMidY,
                    -hw, oRUpperY,
                    -hw, hd,
                ],
            "name" : params.d ~ " TFB",
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [-hw, -hd],
                    [-hw, 0],
                    [-hw, hd],

                    [0, -hd],
                    [0, hd],

                    [hw, -hd],
                    [hw, 0],
                    [hw, hd],
                ],
            "allowFlip" : false,
            "data" : params
        };
}

//================ Special generators ================//

function generateSpecialUnistrutProfile(params is map) returns map
{
    // Params has width (w), depth (d), wall thickness (wT), internal width (iW), internal depth (iD)

    // iD is from the origin to the inside of the bit at the top.

    // This assumes a 1mm internal radius
    const d is number = params.d;
    const hW is number = params.w / 2;
    const hIW is number = params.iW / 2;

    const iD is number = params.iD;

    const wT is number = params.wT;

    const iR is number = 1;
    const iRDist is number = iR - sqrt((iR ^ 2) / 2);
    const iRDistO is number = iRDist + wT;

    const oR is number = wT + iR;
    const oRDist is number = oR - sqrt((oR ^ 2) / 2);

    // This starts at the base and goes clockwise
    return {
            "sequence" : "LALALALLLALALALALALALLLALALA",
            "units" : millimeter,
            "points" : [
                    // base out
                    hW - oR, 0,
                    -hW + oR, 0,
                    // arc
                    -hW + oRDist, oRDist,
                    // lhs out
                    -hW, oR,
                    -hW, d - oR,
                    // arc
                    -hW + oRDist, d - oRDist,
                    // top left out
                    -hW + oR, d,
                    -hIW - oR, d,
                    // arc
                    -hIW - oRDist, d - oRDist,
                    // top left right out
                    -hIW, d - oR,
                    -hIW, iD,
                    // top left right in
                    -hIW - wT, iD,
                    -hIW - wT, d - oR,
                    // arc
                    -hIW - iRDistO, d - iRDistO,
                    // top left in
                    -hIW - oR, d - wT,
                    -hW + oR, d - wT,
                    // arc
                    -hW + iRDistO, d - iRDistO,
                    // left in
                    -hW + wT, d - oR,
                    -hW + wT, oR,
                    // arc
                    -hW + iRDistO, iRDistO,
                    // base in
                    -hW + oR, wT,
                    hW - oR, wT,
                    // arc
                    hW - iRDistO, iRDistO,
                    // right in
                    hW - wT, oR,
                    hW - wT, d - oR,
                    // arc
                    hW - iRDistO, d - iRDistO,
                    // top right in
                    hW - oR, d - wT,
                    hIW + oR, d - wT,
                    // arc
                    hIW + iRDistO, d - iRDistO,
                    // top right left in
                    hIW + wT, d - oR,
                    hIW + wT, iD,
                    // top right left out
                    hIW, iD,
                    hIW, d - oR,
                    // arc
                    hIW + oRDist, d - oRDist,
                    // top right out
                    hIW + oR, d,
                    hW - oR, d,
                    // arc
                    hW - oRDist, d - oRDist,
                    // right out
                    hW, d - oR,
                    hW, oR,
                    // arc
                    hW - oRDist, oRDist,
                    // base out right
                    hW - oR, 0,
                ],
            "name" : params.desig,
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [-hW, 0],
                    [-hW, d / 2],
                    [-hW, d],

                    [0, d / 2],
                    [0, d],

                    [hW, 0],
                    [hW, d / 2],
                    [hW, d],
                ],
            "data" : params
        };
}

function generateSpecialUnistrutOneGrooveProfile(params is map) returns map
{
    // Params has width (w), depth (d), wall thickness (wT), internal width (iW), internal depth (iD)
    // Groove height is (d/2)

    // iD is from the origin to the inside of the bit at the top.

    // This assumes a 1mm internal radius
    const d is number = params.d;
    const hW is number = params.w / 2;
    const hIW is number = params.iW / 2;

    const g is number = d / 2;

    const iD is number = params.iD;

    const wT is number = params.wT;

    const triangleHeight is number = sqrt(3) * params.wT / 2;

    const iR is number = 1;
    const iRDist is number = iR - sqrt((iR ^ 2) / 2);
    const iRDistO is number = iRDist + wT;

    const oR is number = wT + iR;
    const oRDist is number = oR - sqrt((oR ^ 2) / 2);

    const arcOffset is number = triangleHeight * 2 - wT / 2;

    // This starts at the base and goes clockwise
    return {
            "sequence" : "LALAAALALALLLALALALALALALALALLLALALAAALA",
            "units" : millimeter,
            "points" : [
                    // base out
                    hW - oR, 0,
                    -hW + oR, 0,
                    // arc
                    -hW + oRDist, oRDist,
                    // lhs out
                    -hW, oR,
                    -hW, g - triangleHeight * 2,
                    // arcs
                    -hW + wT - triangleHeight, g - arcOffset,
                    -hW + wT / 2, g - triangleHeight,
                    -hW + wT, g,
                    -hW + wT / 2, g + triangleHeight,
                    -hW + wT - triangleHeight, g + arcOffset,
                    // lhs out top
                    -hW, g + triangleHeight * 2,
                    -hW, d - oR,
                    // arc
                    -hW + oRDist, d - oRDist,
                    // top left out
                    -hW + oR, d,
                    -hIW - oR, d,
                    // arc
                    -hIW - oRDist, d - oRDist,
                    // top left right out
                    -hIW, d - oR,
                    -hIW, iD,
                    // top left right in
                    -hIW - wT, iD,
                    -hIW - wT, d - oR,
                    // arc
                    -hIW - iRDistO, d - iRDistO,
                    // top left in
                    -hIW - oR, d - wT,
                    -hW + oR, d - wT,
                    // arc
                    -hW + iRDistO, d - iRDistO,
                    // left in upper
                    -hW + wT, d - oR,
                    -hW + wT, g + triangleHeight * 2,
                    // arc
                    -hW + wT * 2, g,
                    // left in lower
                    -hW + wT, g - triangleHeight * 2,
                    -hW + wT, oR,
                    // arc
                    -hW + iRDistO, iRDistO,
                    // base in
                    -hW + oR, wT,
                    hW - oR, wT,
                    // arc
                    hW - iRDistO, iRDistO,
                    // right in lower
                    hW - wT, oR,
                    hW - wT, g - triangleHeight * 2,
                    // arc
                    hW - wT * 2, g,
                    // right in upper
                    hW - wT, g + triangleHeight * 2,
                    hW - wT, d - oR,
                    // arc
                    hW - iRDistO, d - iRDistO,
                    // top right in
                    hW - oR, d - wT,
                    hIW + oR, d - wT,
                    // arc
                    hIW + iRDistO, d - iRDistO,
                    // top right left in
                    hIW + wT, d - oR,
                    hIW + wT, iD,
                    // top right left out
                    hIW, iD,
                    hIW, d - oR,
                    // arc
                    hIW + oRDist, d - oRDist,
                    // top right out
                    hIW + oR, d,
                    hW - oR, d,
                    // arc
                    hW - oRDist, d - oRDist,
                    // right out
                    hW, d - oR,
                    hW, g + triangleHeight * 2,
                    // arcs
                    hW - wT + triangleHeight, g + arcOffset,
                    hW - wT / 2, g + triangleHeight,
                    hW - wT, g,
                    hW - wT / 2, g - triangleHeight,
                    hW - wT + triangleHeight, g - arcOffset,
                    // right out lower
                    hW, g - triangleHeight * 2,
                    hW, oR,
                    // arc
                    hW - oRDist, oRDist,
                    // base out right
                    hW - oR, 0,
                ],
            "name" : params.desig,
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [-hW, 0],
                    [-hW, d / 2],
                    [-hW, d],

                    [0, d / 2],
                    [0, d],

                    [hW, 0],
                    [hW, d / 2],
                    [hW, d],
                ],
            "data" : params
        };
}

function generateSpecialUnistrutTwoGrooveProfile(params is map) returns map
{
    // Params has width (w), depth (d), wall thickness (wT), internal width (iW), internal depth (iD)
    // Groove height is (d/4) and (d*3/4)

    // iD is from the origin to the inside of the bit at the top.

    // This assumes a 1mm internal radius
    const d is number = params.d;
    const hW is number = params.w / 2;
    const hIW is number = params.iW / 2;

    const g1 is number = d / 4;
    const g2 is number = d * 3 / 4;

    const iD is number = params.iD;

    const wT is number = params.wT;

    const triangleHeight is number = sqrt(3) * params.wT / 2;

    const iR is number = 1;
    const iRDist is number = iR - sqrt((iR ^ 2) / 2);
    const iRDistO is number = iRDist + wT;

    const oR is number = wT + iR;
    const oRDist is number = oR - sqrt((oR ^ 2) / 2);

    const arcOffset is number = triangleHeight * 2 - wT / 2;

    // This starts at the base and goes clockwise
    return {
            "sequence" : "LALAAALAAALALALLLALALALALALALALALALALLLALALAAALAAALA",
            "units" : millimeter,
            "points" : [
                    // base out
                    hW - oR, 0,
                    -hW + oR, 0,
                    // arc
                    -hW + oRDist, oRDist,
                    // lhs out
                    -hW, oR,
                    -hW, g1 - triangleHeight * 2,
                    // arcs
                    -hW + wT - triangleHeight, g1 - arcOffset,
                    -hW + wT / 2, g1 - triangleHeight,
                    -hW + wT, g1,
                    -hW + wT / 2, g1 + triangleHeight,
                    -hW + wT - triangleHeight, g1 + arcOffset,
                    // lhs out mid
                    -hW, g1 + triangleHeight * 2,
                    -hW, g2 - triangleHeight * 2,
                    // arcs
                    -hW + wT - triangleHeight, g2 - arcOffset,
                    -hW + wT / 2, g2 - triangleHeight,
                    -hW + wT, g2,
                    -hW + wT / 2, g2 + triangleHeight,
                    -hW + wT - triangleHeight, g2 + arcOffset,
                    // lhs out top
                    -hW, g2 + triangleHeight * 2,
                    -hW, d - oR,
                    // arc
                    -hW + oRDist, d - oRDist,
                    // top left out
                    -hW + oR, d,
                    -hIW - oR, d,
                    // arc
                    -hIW - oRDist, d - oRDist,
                    // top left right out
                    -hIW, d - oR,
                    -hIW, iD,
                    // top left right in
                    -hIW - wT, iD,
                    -hIW - wT, d - oR,
                    // arc
                    -hIW - iRDistO, d - iRDistO,
                    // top left in
                    -hIW - oR, d - wT,
                    -hW + oR, d - wT,
                    // arc
                    -hW + iRDistO, d - iRDistO,
                    // left in upper
                    -hW + wT, d - oR,
                    -hW + wT, g2 + triangleHeight * 2,
                    // arc
                    -hW + wT * 2, g2,
                    // left in mid
                    -hW + wT, g2 - triangleHeight * 2,
                    -hW + wT, g1 + triangleHeight * 2,
                    // arc
                    -hW + wT * 2, g1,
                    // left in lower
                    -hW + wT, g1 - triangleHeight * 2,
                    -hW + wT, oR,
                    // arc
                    -hW + iRDistO, iRDistO,
                    // base in
                    -hW + oR, wT,
                    hW - oR, wT,
                    // arc
                    hW - iRDistO, iRDistO,
                    // right in lower
                    hW - wT, oR,
                    hW - wT, g1 - triangleHeight * 2,
                    // arc
                    hW - wT * 2, g1,
                    // right in mid
                    hW - wT, g1 + triangleHeight * 2,
                    hW - wT, g2 - triangleHeight * 2,
                    // arc
                    hW - wT * 2, g2,
                    // right in upper
                    hW - wT, g2 + triangleHeight * 2,
                    hW - wT, d - oR,
                    // arc
                    hW - iRDistO, d - iRDistO,
                    // top right in
                    hW - oR, d - wT,
                    hIW + oR, d - wT,
                    // arc
                    hIW + iRDistO, d - iRDistO,
                    // top right left in
                    hIW + wT, d - oR,
                    hIW + wT, iD,
                    // top right left out
                    hIW, iD,
                    hIW, d - oR,
                    // arc
                    hIW + oRDist, d - oRDist,
                    // top right out
                    hIW + oR, d,
                    hW - oR, d,
                    // arc
                    hW - oRDist, d - oRDist,
                    // right out
                    hW, d - oR,
                    hW, g2 + triangleHeight * 2,
                    // arcs
                    hW - wT + triangleHeight, g2 + arcOffset,
                    hW - wT / 2, g2 + triangleHeight,
                    hW - wT, g2,
                    hW - wT / 2, g2 - triangleHeight,
                    hW - wT + triangleHeight, g2 - arcOffset,
                    // right out mid
                    hW, g2 - triangleHeight * 2,
                    hW, g1 + triangleHeight * 2,
                    // arcs
                    hW - wT + triangleHeight, g1 + arcOffset,
                    hW - wT / 2, g1 + triangleHeight,
                    hW - wT, g1,
                    hW - wT / 2, g1 - triangleHeight,
                    hW - wT + triangleHeight, g1 - arcOffset,
                    // right out lower
                    hW, g1 - triangleHeight * 2,
                    hW, oR,
                    // arc
                    hW - oRDist, oRDist,
                    // base out right
                    hW - oR, 0,
                ],
            "name" : params.desig,
            "material" : STEEL_MATERIAL,
            "extraOriginPoints" : [
                    [-hW, 0],
                    [-hW, d / 2],
                    [-hW, d],

                    [0, d / 2],
                    [0, d],

                    [hW, 0],
                    [hW, d / 2],
                    [hW, d],
                ],
            "data" : params
        };
}

FeatureScript 1420;

/**
 * This is the Australian Beams feature set by MBartlett21
 * The official (and supported) FeatureScript features are located at
 *      `http://onsha.pe/documents/cfcc264d41817d876589755c`.
 *
 * This feature set was inspired by Neil Cooke's beam feature at
 *      `http://onsha.pe/documents/e15c2c668d138f01242d0c80`.
 *
 * Beams created by features in this document all have a BeamAttribute set on them
 * that details aspects of the beam, such as profile, end faces, weld gap, etc.
 * The definition of BeamAttribute and detailed documentation can be found in the
 * beamAttribute.fs tab. Additionally, BeamAttribute access functions are also
 * defined for getting and setting BeamAttributes.
 *
 * Two parts of this feature set are largely the same as Neil's feature: the profile
 * generator and the profile sketcher. However, these have been changed to improve
 * performance while still maintaining compatibility with his feature.
 */

import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/evaluate.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/math.fs", version : "1420.0");
import(path : "onshape/std/properties.fs", version : "1420.0");
import(path : "onshape/std/sketch.fs", version : "1420.0");
import(path : "onshape/std/surfaceGeometry.fs", version : "1420.0");
import(path : "onshape/std/transform.fs", version : "1420.0");
import(path : "onshape/std/topologyUtils.fs", version : "1420.0");
import(path : "onshape/std/valueBounds.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");

import(path : "461abf12c4538821ba44202e", version : "dc48c187b3b505a05d4725f5");
import(path : "404f7326c439894ea55e4ff6", version : "9615878e7ceb77598932a50b");
import(path : "c2b82726e7f4a3a5c01bab32", version : "7c1d710ab0b808a9dde88d65");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");
import(path : "49b8d20178fdd97d3725901b", version : "68fa7b07742ebd6dd7f5babd");

export import(path : "onshape/std/mateconnectoraxistype.gen.fs", version : "1420.0");
export import(path : "36a9ddae9bf40490e73da4f5", version : "7469bb89427b19a126a87c01");

ICON::import(path : "514bfde822a8cbb63f0fee24", version : "d3c5f72ddccb2d43869d3e18");

export enum ManualOrAutomatic
{
    annotation { "Name" : "Manual" }
    MANUAL,
    annotation { "Name" : "Automatic" }
    AUTO
}

export const BEAM_WELDGAP_BOUNDS is LengthBoundSpec = {
            (meter) : [0, 0.0015, 0.1],
            (centimeter) : 0.15,
            (millimeter) : 1.5,
            (inch) : 0.0625,
            (foot) : 0.005,
            (yard) : 0.0017
        } as LengthBoundSpec;

/**
 * This feature creates beams along lines specified in `aEntities`.
 *
 * @param id : @autocomplete `id + "beams1"`
 * @param definition {{
 *      @field aEntities {Query}        : @autocomplete `edges` A query for edges to create beams along.
 *      @field trimFaces {Query}        : A query for faces to trim created beams to. @optional
 *      @field trimBeams {Query}        : A query for parts to trim created beams to. @optional
 *      @field profileType {ProfileType}: The type of profile to generate. Depending on the type of profile,
 *                                          other parameters need to be filled.
 *      @field offsetX {ValueWithUnits} : The x-offset of the beams. @optional
 *      @field offsetY {ValueWithUnits} : The y-offset of the beams. @optional
 *      @field weldGap {ValueWithUnits} : The weld gap of the beams. @optional
 * }}
 */
annotation { "Feature Type Name" : "Aus Beams",
        "Editing Logic Function" : "beamsEditLogic",
        "Manipulator Change Function" : "beamsManipulatorChange",
        "Feature Name Template" : "Aus Beams #profileName",
        "Feature Type Description" : "Create beams along selected edges." ~
            "<ol><li>Select edges to create beams along.</li>" ~
            "<li>Choose the profile to use.</li>" ~
            "<li>Choose how to trim the beams.</li>" ~
            "<li>Choose weld gap and offset.</li></ol>",
        "Icon" : ICON::BLOB_DATA }
export const beamsOuter = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        // Pre-selection
        annotation { "UIHint" : UIHint.ALWAYS_HIDDEN,
                    "Filter" : EntityType.EDGE ||
                        (EntityType.FACE && (BodyType.SOLID || ConstructionObject.YES)) ||
                        (EntityType.BODY && BodyType.SOLID) }
        definition.initEntities is Query;

        annotation { "Group Name" : "Selection", "Collapsed By Default" : false }
        {
            annotation { "Name" : "Selection type", "Default" : ManualOrAutomatic.AUTO, "UIHint" : [UIHint.HORIZONTAL_ENUM, UIHint.REMEMBER_PREVIOUS_VALUE],
                        "Description" : "Automatic selection gives single rotation and flip inputs for all the edges. " ~
                            "Manual selection allows separate flipping and rotation for each selection. " ~
                            "If you choose Manual after filling out edges, it will split them into separate loops in the Manual inputs." }
            definition.selectionType is ManualOrAutomatic;

            if (definition.selectionType == ManualOrAutomatic.AUTO)
            {
                annotation { "Name" : "Edges", "Filter" : EntityType.EDGE || (EntityType.BODY && BodyType.WIRE),
                            "UIHint" : [UIHint.ALLOW_QUERY_ORDER, UIHint.SHOW_CREATE_SELECTION] }
                definition.aEntities is Query;

                annotation { "Name" : "Rotation" }
                isAngle(definition.aRotation, ANGLE_360_ZERO_DEFAULT_BOUNDS);

                annotation { "Name" : "Rotate 90 degrees", "UIHint" : UIHint.MATE_CONNECTOR_AXIS_TYPE }
                definition.aRotation90 is MateConnectorAxisType;

                annotation { "Name" : "Flip beams" }
                definition.aFlipped is boolean;
            }
            else
            {
                annotation { "Name" : "Loops", "Item name" : "Loop", "Item label template" : "Loop #entities" }
                definition.loops is array;
                for (var loop in definition.loops)
                {
                    annotation { "Name" : "Edges or vertices", "Filter" : EntityType.EDGE || QueryFilterCompound.ALLOWS_VERTEX,
                                "Description" : "Create a loop with the selected edges or vertices. " ~
                                    "If vertices are selected, a loop is made with straight edges between each vertex. " ~
                                    "Uncheck Close vertex loops to stop the last vertex connecting to the first one.",
                                "UIHint" : [UIHint.ALLOW_QUERY_ORDER, UIHint.SHOW_CREATE_SELECTION] }
                    loop.entities is Query;

                    annotation { "Name" : "Rotation", "UIHint" : UIHint.MATCH_LAST_ARRAY_ITEM }
                    isAngle(loop.rotation, ANGLE_360_ZERO_DEFAULT_BOUNDS);

                    annotation { "Name" : "Rotate 90 degrees", "UIHint" : [UIHint.MATCH_LAST_ARRAY_ITEM, UIHint.MATE_CONNECTOR_AXIS_TYPE] }
                    loop.rotation90 is MateConnectorAxisType;

                    annotation { "Name" : "Flip loop" }
                    loop.flipped is boolean;
                }

                annotation { "Name" : "Close vertex loops", "Default" : true }
                definition.makeClosed is boolean;

                annotation { "Name" : "Separate tangent edges", "Default" : false }
                definition.makeSeparate is boolean;
            }
        }

        profileSelection(definition);

        annotation { "Name" : "Trim beams" }
        definition.trim is boolean;

        if (definition.trim)
        {
            annotation { "Group Name" : "Trim beams", "Collapsed By Default" : false, "Driving Parameter" : "trim" }
            {
                annotation { "Name" : "Faces to trim to", "Filter" : EntityType.FACE &&
                                (BodyType.SOLID || ConstructionObject.YES) &&
                                (GeometryType.PLANE || GeometryType.CYLINDER || GeometryType.SPHERE || GeometryType.TORUS), "UIHint" : UIHint.SHOW_CREATE_SELECTION }
                definition.trimFaces is Query;

                annotation { "Name" : "Parts to trim to", "Filter" : EntityType.BODY && BodyType.SOLID }
                definition.trimBeams is Query;

                annotation { "Name" : "Trim with previous loops" }
                definition.trimPrevBeams is boolean;
            }
        }

        annotation { "Name" : "Offset beams" }
        definition.hasOffset is boolean;

        if (definition.hasOffset)
        {
            annotation { "Group Name" : "Offset beams", "Collapsed By Default" : false, "Driving Parameter" : "hasOffset" }
            {
                annotation { "Name" : "X offset" }
                isLength(definition.offsetX, ZERO_DEFAULT_LENGTH_BOUNDS);

                annotation { "Name" : "X offset opposite direction", "UIHint" : UIHint.OPPOSITE_DIRECTION }
                definition.offsetXOpposite is boolean;

                annotation { "Name" : "Y offset" }
                isLength(definition.offsetY, ZERO_DEFAULT_LENGTH_BOUNDS);

                annotation { "Name" : "Y offset opposite direction", "UIHint" : UIHint.OPPOSITE_DIRECTION }
                definition.offsetYOpposite is boolean;
            }
        }

        annotation { "Name" : "Weld gap", "Column Name" : "Has weld gap", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.FIRST_IN_ROW, UIHint.REMEMBER_PREVIOUS_VALUE],
                    "Description" : "Add a weld gap between the beams." }
        definition.hasWeldGap is boolean;

        if (definition.hasWeldGap)
            annotation { "Name" : "Weld gap", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.REMEMBER_PREVIOUS_VALUE] }
            isLength(definition.weldGap, BEAM_WELDGAP_BOUNDS);

        annotation { "Group Name" : "Butt joints", "Collapsed By Default" : true }
        {
            annotation { "Name" : "Vertices for butt joints", "Filter" : EntityType.VERTEX }
            definition.buttJoints is Query;

            annotation { "Name" : "Flipped butt joints", "Filter" : EntityType.VERTEX }
            definition.buttJointsFlipped is Query;

            annotation { "Name" : "Coped butt joints" }
            definition.buttJointBooleanTrim is boolean;
        }

        annotation { "Name" : "Profile custom property", "Column Name" : "Profile name",
                    "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.FIRST_IN_ROW, UIHint.REMEMBER_PREVIOUS_VALUE],
                    "Description" : "Fill out the profile custom property if it wasn't programmed." }
        definition.cpProfileName is boolean;

        if (definition.cpProfileName)
            annotation { "Name" : "Profile name", "MaxLength" : 24,
                        "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.REMEMBER_PREVIOUS_VALUE] }
            definition.cpProfileNameId is string;

        // annotation { "Group Name" : "Advanced", "Collapsed By Default" : true }
        // {
        //     annotation { "Name" : "Version" }
        //     definition.featureVersion is FeatureVersion;
        // }

        // This is the selection for the origin that the profile is sketched around (see `pointsManipulator` use in beamInternal.fs)
        annotation { "UIHint" : UIHint.ALWAYS_HIDDEN }
        isInteger(definition.profileOriginPoint, PROFILE_ORIGIN_POINT_BOUNDS);

        // So we can populate the profile name into the feature name
        annotation { "UIHint" : UIHint.ALWAYS_HIDDEN }
        definition.profileName is string;
    }
    {
        if (definition.cpProfileName)
            definition->checkPropertyId("cpProfileNameId");

        const entitiesForTransform is Query = definition.selectionType == ManualOrAutomatic.AUTO
            // Keep the selection order
            ? definition.aEntities->dissolveWires()
            : definition.loops->collectSubParameters("entities")->qUnion();

        const remainingTransform is Transform = context->getRemainderPatternTransform({ "references" : entitiesForTransform });

        var loops;

        const toDelete is box = new box(qCreatedBy(id + "p"));

        if (definition.selectionType == ManualOrAutomatic.AUTO)
        {
            const rotation is ValueWithUnits = mcAxisTypeToAngle[definition.aRotation90] + definition.aRotation;
            const pathLoops is array = context->constructPaths(entitiesForTransform);
            loops = context->splitToTangentLoops(
                    pathLoops->mapArray(function(loop is map) returns map
                    {
                        return {
                                "entities" : loop.edges->qUnion(),
                                "rotation" : rotation,
                                "flipped" : definition.aFlipped
                            };
                    }),
                    false);
        }
        else
            loops = context->splitToTangentLoops(
                    context->doVertexLoops(
                        id + "vertexLoops",
                        definition.loops->mapArray(function(loop is map) returns map
                        {
                            return {
                                    "entities" : loop.entities,
                                    "rotation" : mcAxisTypeToAngle[loop.rotation90] + loop.rotation,
                                    "flipped" : loop.flipped,
                                };
                        }),
                        toDelete,
                        definition.makeClosed
                    ),
                    definition.makeSeparate
                );

        if (loops == [])
        {
            if (definition.selectionType == ManualOrAutomatic.AUTO)
                throw regenError("Please select edges to create beams with.", ["aEntities"]);

            else
                throw regenError("Please select loops of edges or vertices to create beams with.", ["loops"]);
        }

        const weldGap is ValueWithUnits = definition.hasWeldGap ? definition.weldGap : 0 * meter;

        const buttJoints is Query = context->evaluateQuery(definition.buttJoints)->qUnion();

        const buttJointsFlipped is Query = context->evaluateQuery(definition.buttJointsFlipped)->qUnion();

        const buttJointBooleanTrim is boolean = definition.buttJointBooleanTrim;

        const offsetX is ValueWithUnits = definition.hasOffset ?
            (definition.offsetXOpposite ? -definition.offsetX : definition.offsetX) :
            0 * meter;

        const offsetY is ValueWithUnits = definition.hasOffset ?
            (definition.offsetYOpposite ? -definition.offsetY : definition.offsetY) :
            0 * meter;

        const profileMap is map = context->sketchProfile(
                id + "p",
                context->generateProfile(definition),
                definition.flipYAxis,
                definition.profileOriginPoint,
                vector(offsetX, offsetY));

        const profileQ is Query = profileMap.q;
        const profileData is BeamProfile = profileMap.profile;
        const profileEdgeCount is number = profileMap.edgeCount;

        if (profileData.minRadius is number)
        {
            var loopEntities = emptyQ;
            for (var loopSet in loops)
                for (var tangentLoop in loopSet)
                    loopEntities += tangentLoop.entities->qGeometry(GeometryType.ARC);

            context->checkMinimumRadius(id, loopEntities, profileData.minRadius * meter);
        }

        const trimFaces is Query = definition.trim ? definition.trimFaces : emptyQ;
        const trimBeams is Query = definition.trim ? definition.trimBeams : emptyQ;

        const endFaceMap is box = new box({});
        const endFaceOrder is box = new box([]); // This array represents the order of creation of the end faces

        var counter is number = 0;
        var beamsForTrim = trimBeams;
        for (var loopSet in loops)
        {
            var beamsInLoopSet = emptyQ;
            for (var tangentLoop in loopSet)
            {
                const beamId is Id = id + "beam" + counter->unstableIdComponent();

                // TODO: Test whether the disambiguation can use the whole tangentLoop.
                // It didn't work originally, but that was when we did it for a whole loopSet.
                context->setExternalDisambiguation(beamId, tangentLoop.path.edges[0]);

                const beam is Query = context->createBeamAlongPath(beamId, {
                            "loop" : tangentLoop,
                            "profile" : profileQ,
                            "profileData" : profileData,
                            "profileEdgeCount" : profileEdgeCount,
                            "trimFaces" : trimFaces,
                            "trimParts" : beamsForTrim,
                            "addManipulators" : counter == 0,
                            "profileOriginPoint" : definition.profileOriginPoint,
                            "offsetX" : offsetX,
                            "offsetY" : offsetY,
                            "topId" : id,
                            "weldGap" : weldGap,
                            "endFaceMap" : endFaceMap,
                            "endFaceOrder" : endFaceOrder,
                            "toDelete" : toDelete,
                            "transform" : remainingTransform
                        });
                beamsInLoopSet += beam;
                counter += 1;
            }

            counter = context->doJoints(
                    id + "beam",
                    context->getJoints(endFaceMap, false, endFaceOrder[]),
                    counter,
                    buttJoints,
                    buttJointsFlipped,
                    buttJointBooleanTrim,
                    weldGap,
                    id);

            if (definition.trim && definition.trimPrevBeams)
                beamsForTrim += beamsInLoopSet;
        }

        context->opDeleteBodies(id + "delete", {
                    "entities" : toDelete[]
                });

        var jointCounter = 0;
        while (endFaceMap[] != {})
            jointCounter = context->doJoints(
                    id + "joint",
                    context->getJoints(endFaceMap, true, endFaceOrder[]),
                    jointCounter,
                    buttJoints,
                    buttJointsFlipped,
                    buttJointBooleanTrim,
                    weldGap,
                    id);

        const profileName is string = profileData.name;

        context->setFeatureComputedParameter(id, {
                    "name" : "profileName",
                    "value" : profileName
                });

        context->setProperty({
                    "entities" : qCreatedBy(id, EntityType.BODY),
                    "propertyType" : PropertyType.NAME,
                    "value" : profileName
                });

        context->setProperty({
                    "entities" : qCreatedBy(id, EntityType.BODY),
                    "propertyType" : PropertyType.DESCRIPTION,
                    "value" : profileName
                });

        context->doEndFaces(qCreatedBy(id, EntityType.BODY));

        // Custom properties

        const profileNameIds is array = definition.cpProfileName ? cpProfileNameIds->append(definition.cpProfileNameId) : cpProfileNameIds;

        context->setProperty(qCreatedBy(id, EntityType.BODY), profileNameIds, profileName);

        if (profileData.maxLength is number)
        {
            const cutlistData is array = context->getCutlist(qCreatedBy(id, EntityType.BODY) * qAllModifiableSolidBodies());
            const maxLength is number = profileData.maxLength + TOLERANCE.zeroLength * 2;

            var longParts = emptyQ;
            for (var beamGroup in cutlistData)
                if (beamGroup.length.value > maxLength)
                    longParts += beamGroup.beam;

            if (longParts != emptyQ)
            {
                context->setErrorEntities(id, { "entities" : longParts });
                if (!featureHasNonTrivialStatus(context, id))
                    context->reportFeatureWarning(id, "Warning: Highlighted beams are longer than " ~ maxLength->roundToPrecision(3) ~ "m, which is the longest extrusion length allowed.");
            }
        }
    }, {
            initEntities : emptyQ,

            selectionType : ManualOrAutomatic.AUTO,

            aRotation90 : MateConnectorAxisType.PLUS_X,
            aRotation : 0 * degree,

            loops : [],
            makeClosed : true,

            trim : true,
            trimFaces : emptyQ,
            trimBeams : emptyQ,
            trimPrevBeams : false,

            profileOriginPoint : -1,
            profileName : "",

            hasOffset : true,
            offsetX : 0 * meter,
            offsetXOpposite : false,
            offsetY : 0 * meter,
            offsetYOpposite : false,

            hasWeldGap : true,
            weldGap : 0 * meter,

            buttJoints : emptyQ,
            buttJointsFlipped : emptyQ,

            cpProfileName : false
        });

export function beamsManipulatorChange(context is Context, definition is map, newManipulators is map) returns map
{
    for (var manip in newManipulators)
    {
        const key is string = manip.key;
        const value is map = manip.value;
        definition = context->updateDefinitionForManip(definition, key, value);
    }
    return definition;
}

export function beamsEditLogic(context is Context, id is Id, oldDefinition is map, definition is map, isCreating is boolean) returns map
{
    if (isCreating && oldDefinition == {} && context->evaluateQuery(definition.initEntities) != [])
    {
        definition.selectionType = ManualOrAutomatic.AUTO;
        definition.aEntities = definition.initEntities->qEntityFilter(EntityType.EDGE) +
            definition.initEntities->qEntityFilter(EntityType.BODY)->qBodyType(BodyType.WIRE);
        const faces is Query = definition.initEntities->qEntityFilter(EntityType.FACE);
        const parts is Query = definition.initEntities->qEntityFilter(EntityType.BODY)->qBodyType(BodyType.SOLID);
        if (@size(context->evaluateQuery(faces + parts)) > 0)
        {
            definition.trim = true;
            definition.trimBeams = parts;
            definition.trimFaces = faces;
        }
        definition.initEntities = emptyQ;
    }
    else if (oldDefinition.selectionType == ManualOrAutomatic.AUTO &&
        definition.selectionType == ManualOrAutomatic.MANUAL && // We just selected Manual
        definition.loops == [] &&
        context->evaluateQuery(definition.aEntities) != [])
    {
        // We want to autofill the manual selection with what the auto was using, so that the user can then easily continue.
        const rotation is ValueWithUnits = definition.aRotation;
        const rotation90 = definition.aRotation90;

        const pathLoops is array = context->constructPaths(definition.aEntities->dissolveWires());
        definition.loops = pathLoops->mapArray(function(loop is Path) returns map
            {
                return {
                        "entities" : loop.edges->qUnion(),
                        "rotation" : rotation,
                        "rotation90" : rotation90,
                        "flipped" : false
                    };
            });
        definition.makeSeparate = false; // Auto never splits up tangent edges
    }

    return definition;
}


/**
 * This function merges locations in endFaceBox from exact location to end faces.
 * The returned map is guaranteed to have at least two faces for every key.
 */
function getJoints(context is Context, endFaceMapBox is box, clearSingle is boolean, endFaceOrder is array) returns map
{
    const endFaceMap is map = endFaceMapBox[];
    const rawLocations is array = endFaceMap->keys();
    var faces is array = [];
    var locations is array = [];

    // This below converts from a map from location to faces to two matrices, merging close locations
    for (var location in rawLocations)
    {
        var found is boolean = false;
        for (var i = 0; i < @size(locations); i += 1)
            if (location->tolerantEquals(locations[i][0]))
            {
                found = true;
                locations[i] = locations[i]->append(location);
                faces[i] = faces[i]->append(endFaceMap[location]);
                break;
            }

        if (!found)
        {
            locations = locations->append([location]);
            faces = faces->append([endFaceMap[location]]);
        }
    }
    var out is map = {};
    for (var i = 0; i < @size(locations); i += 1)
    {
        const locationsI is array = locations[i];
        const facesI is array = faces[i];
        const evFaces is array = context->evaluateQuery(endFaceOrder->qUnion() * facesI->qUnion()); // Get the faces in order of creation
        if (@size(evFaces) >= 2)
        {
            const faces is array = [evFaces[0], evFaces[1]];
            out[locationsI[0]] = faces;
            for (var j = 0; j < @size(locationsI); j += 1)
            {
                const facesLeft is array = context->evaluateQuery(facesI[j] - faces->qUnion());
                if (facesLeft == [])
                    endFaceMapBox[][locationsI[j]] = undefined;
                else
                    endFaceMapBox[][locationsI[j]] = facesLeft->mapArray(function(q is Query) returns Query
                            {
                                return q + context->startTrackingIdentity(q);
                            })->qUnion();
            }
        }
        else if (clearSingle)
            for (var location in locationsI)
                endFaceMapBox[][location] = undefined;
    }
    return out;
}

function doVertexLoops(context is Context, id is Id, loops is array, toDelete is box, makeClosed is boolean) returns array
{
    var out is array = [];
    var counter is number = 0;
    for (var i = 0; i < @size(loops); i += 1)
    {
        var loop is map = loops[i];
        const entities is Query = loop.entities;
        const edges is array = context->evaluateQuery(entities->qEntityFilter(EntityType.EDGE));
        const vertices is array = context->evaluateQuery(entities->qQueryCompoundFilter(QueryFilterCompound.ALLOWS_VERTEX));

        // Don't change if there is no vertices
        if (vertices == [])
        {
            out = out->append(loop);
            continue;
        }

        if (edges != [])
            throw regenError("Cannot have both vertices and edges in the same selection.", [faultyArrayParameterId("loops", i, "entities")], entities);

        if (@size(vertices) == 1) // We can't make an edge with only one vertex, so ignore it and don't stop the whole feature.
            continue;

        const loopId is Id = id + counter->unstableIdComponent();
        context->setExternalDisambiguation(loopId, vertices[0]);

        const useSketch is boolean = @size(vertices) > 2;

        var vertexEdges is Query = emptyQ;

        if (useSketch)
        {
            const vertex3dPointsTo3 is array = vertices->resize(3)->mapArray(function(v is Query) returns Vector
                {
                    return context->evVertexPoint({ "vertex" : v });
                });

            // Work out the plane that the path is on so we can sketch it
            var sketchNormal = cross(vertex3dPointsTo3[2] - vertex3dPointsTo3[0], vertex3dPointsTo3[1] - vertex3dPointsTo3[0]);
            if (sketchNormal->norm().value < TOLERANCE.zeroLength)
                sketchNormal = try silent(context->evOwnerSketchPlane({ "entity" : entities->qNthElement(0) }).normal);

            if (sketchNormal == undefined)
                throw regenError("Loop plane could not be computed.", [faultyArrayParameterId("loops", i, "entities")], entities);

            const sketchPlane is Plane = plane(vertex3dPointsTo3[0], sketchNormal);

            const vertexPoints is array = vertices->mapArray(function(v is Query) returns Vector
                {
                    // The point is evaluated again here, rather than using pre-evaluated points so that we can error with the right point.
                    const point is Vector = context->evVertexPoint({ "vertex" : v });

                    const pos is Vector = sketchPlane->worldToPlane(point);
                    if (!tolerantEquals(sketchPlane->planeToWorld(pos), point))
                        throw regenError("Point should be on plane.", [faultyArrayParameterId("loops", i, "entities")], v);
                    return pos;
                });

            // Sketch the edges
            const sketch is Sketch = context->newSketchOnPlane(loopId, {
                        "sketchPlane" : sketchPlane
                    });

            for (var j = 1; j < @size(vertexPoints); j += 1)
            {
                const edgeId is string = "edge" ~ j;
                sketch->skLineSegment(edgeId, {
                            "start" : vertexPoints[j - 1],
                            "end" : vertexPoints[j]
                        });
                vertexEdges += sketchEntityQuery(loopId, EntityType.EDGE, edgeId);
            }

            if (makeClosed)
            {
                const edgeId is string = "edge" ~ @size(vertexPoints);
                sketch->skLineSegment(edgeId, {
                            "start" : vertexPoints[@size(vertexPoints) - 1],
                            "end" : vertexPoints[0]
                        });
                vertexEdges += sketchEntityQuery(loopId, EntityType.EDGE, edgeId);
            }

            sketch->skSolve();
        }
        else
        {
            context->opFitSpline(loopId, {
                        "points" : [
                                context->evVertexPoint({ "vertex" : vertices[0] }),
                                context->evVertexPoint({ "vertex" : vertices[1] })
                            ]
                    });
            vertexEdges = qCreatedBy(loopId, EntityType.EDGE);
        }

        toDelete[] += qCreatedBy(loopId);

        loop.entities = vertexEdges;
        out = out->append(loop);

        counter += 1;
    }
    return out;
}

function splitToTangentLoops(context is Context, loops is array, makeSeparate is boolean) returns array
{
    var outLoops is array = [];
    for (var loop in loops)
    {
        var currLoopOut is array = [];

        const paths is array = context->getTangentPaths(context->constructPaths(loop.entities), makeSeparate);

        for (var path in paths)
        {
            var loopCopy is map = loop;
            loopCopy.entities = path.edges->qUnion();
            loopCopy.path = loop.flipped ? path->reverse() : path;
            currLoopOut = currLoopOut->append(loopCopy);
        }
        if (currLoopOut != [])
            outLoops = outLoops->append(currLoopOut);
    }
    return outLoops;
}
FeatureScript 1420;

/**
 * This is a feature that creates an attached beam along another one.
 */
import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/evaluate.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/math.fs", version : "1420.0");
import(path : "onshape/std/properties.fs", version : "1420.0");
import(path : "onshape/std/sketch.fs", version : "1420.0");
import(path : "onshape/std/surfaceGeometry.fs", version : "1420.0");
import(path : "onshape/std/transform.fs", version : "1420.0");
import(path : "onshape/std/valueBounds.fs", version : "1420.0");
import(path : "onshape/std/vector.fs", version : "1420.0");

import(path : "d1e0074c7253b828a0a97c4e", version : "3d0a28b2300d9d7976dc91f9");
import(path : "461abf12c4538821ba44202e", version : "dc48c187b3b505a05d4725f5");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");
import(path : "49b8d20178fdd97d3725901b", version : "68fa7b07742ebd6dd7f5babd");

export import(path : "onshape/std/mateconnectoraxistype.gen.fs", version : "1420.0");
export import(path : "36a9ddae9bf40490e73da4f5", version : "7469bb89427b19a126a87c01");


annotation { "Feature Type Name" : "Attached beam",
        "Manipulator Change Function" : "beamAttachedManipulatorChange",
        "Feature Name Template" : "Attached Beam #profileName",
        "Feature Type Description" : "Create a beam beside another beam." ~
            "<ol><li>Select a beam to be beside.</li>" ~
            "<li>Choose the profile to use.</li>" ~
            "<li>Use the points for the location.</li>" ~
            "<li>Choose the offset.</li></ol>" }
export const beamAttached = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Beam", "Filter" : EntityType.BODY && BodyType.SOLID, "MaxNumberOfPicks" : 1,
                    "Description" : "Attach the new beam beside this beam." }
        definition.beam is Query;

        annotation { "Name" : "Rotation" }
        isAngle(definition.rotation, ANGLE_360_ZERO_DEFAULT_BOUNDS);

        annotation { "Name" : "Rotate 90 degrees", "UIHint" : UIHint.MATE_CONNECTOR_AXIS_TYPE }
        definition.rotation90 is MateConnectorAxisType;

        annotation { "Name" : "Flip beam" }
        definition.flipped is boolean;

        profileSelection(definition);

        annotation { "Name" : "Show profile points", "Default" : false,
                    "Description" : "Show the attachment points on the added beam." }
        definition.pointsManipulator is boolean;

        annotation { "Name" : "Show attachment points", "Default" : true,
                    "Description" : "Show the attachment points on the original beam." }
        definition.attachedPointsManipulator is boolean;

        annotation { "Name" : "Offset beams" }
        definition.hasOffset is boolean;

        if (definition.hasOffset)
        {
            annotation { "Group Name" : "Offset beams", "Collapsed By Default" : false, "Driving Parameter" : "hasOffset" }
            {
                annotation { "Name" : "X offset" }
                isLength(definition.offsetX, ZERO_DEFAULT_LENGTH_BOUNDS);

                annotation { "Name" : "X offset opposite direction", "UIHint" : UIHint.OPPOSITE_DIRECTION }
                definition.offsetXOpposite is boolean;

                annotation { "Name" : "Y offset" }
                isLength(definition.offsetY, ZERO_DEFAULT_LENGTH_BOUNDS);

                annotation { "Name" : "Y offset opposite direction", "UIHint" : UIHint.OPPOSITE_DIRECTION }
                definition.offsetYOpposite is boolean;


                annotation { "Name" : "End offset 1" }
                isLength(definition.endOffset1, ZERO_DEFAULT_LENGTH_BOUNDS);

                annotation { "Name" : "End offset 1 opposite direction", "UIHint" : UIHint.OPPOSITE_DIRECTION }
                definition.endOffset1Opposite is boolean;

                annotation { "Name" : "End offset 2" }
                isLength(definition.endOffset2, ZERO_DEFAULT_LENGTH_BOUNDS);

                annotation { "Name" : "End offset 2 opposite direction", "UIHint" : UIHint.OPPOSITE_DIRECTION }
                definition.endOffset2Opposite is boolean;
            }
        }

        annotation { "Name" : "Profile custom property", "Column Name" : "Profile name", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.FIRST_IN_ROW, UIHint.REMEMBER_PREVIOUS_VALUE],
                    "Description" : "Fill out the profile custom property if it wasn't programmed." }
        definition.cpProfileName is boolean;

        if (definition.cpProfileName)
            annotation { "Name" : "Profile name", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.REMEMBER_PREVIOUS_VALUE], "MaxLength" : 24 }
            definition.cpProfileNameId is string;

        // This is the selection for the origin that the profile is sketched around (see `pointsManipulator` use in beamAttachedInternal.fs)
        annotation { "UIHint" : UIHint.ALWAYS_HIDDEN }
        isInteger(definition.profileOriginPoint, PROFILE_ORIGIN_POINT_BOUNDS);

        // This is the selection for the origin that is used to position the profile (see `pointsManipulator` use in beamAttachedInternal.fs)
        annotation { "UIHint" : UIHint.ALWAYS_HIDDEN }
        isInteger(definition.attachedProfileOriginPoint, PROFILE_ORIGIN_POINT_BOUNDS);

        // This is so we can populate the profile name into the feature name
        annotation { "UIHint" : UIHint.ALWAYS_HIDDEN }
        definition.profileName is string;
    }
    {
        if (definition.cpProfileName)
            definition->checkPropertyId("cpProfileNameId");

        const attachedBeam is Query = context->evaluateQuery(definition.beam)->qUnion();

        if (attachedBeam.subqueries == [])
            throw regenError("Please select a beam.", ["beam"]);

        const remainingTransform is Transform = context->getRemainderPatternTransform({ "references" : attachedBeam });

        const toDelete is box = new box(qCreatedBy(id + "p"));

        const profile is BeamProfile = context->generateProfile(definition);

        const offsetX is ValueWithUnits = definition.hasOffset ?
            (definition.offsetXOpposite ? -definition.offsetX : definition.offsetX) :
            0 * meter;

        const offsetY is ValueWithUnits = definition.hasOffset ?
            (definition.offsetYOpposite ? -definition.offsetY : definition.offsetY) :
            0 * meter;

        const endOffset1 is ValueWithUnits = definition.hasOffset ?
            (definition.endOffset1Opposite ? -definition.endOffset1 : definition.endOffset1) :
            0 * meter;

        const endOffset2 is ValueWithUnits = definition.hasOffset ?
            (definition.endOffset2Opposite ? -definition.endOffset2 : definition.endOffset2) :
            0 * meter;

        const profileMap is map = context->sketchProfile(id + "p", profile, definition.flipYAxis, definition.profileOriginPoint, vector(offsetX, offsetY));

        const profileQ is Query = profileMap.q;
        const profileData is BeamProfile = profileMap.profile;

        context->createAttachedBeam(id, {
                    "profile" : profileQ,
                    "profileData" : profileData,
                    "profilePoint" : definition.profileOriginPoint,
                    "profileManip" : definition.pointsManipulator,
                    "profileRotation" : mcAxisTypeToAngle[definition.rotation90] + definition.rotation,
                    "profileOffsetX" : offsetX,
                    "profileOffsetY" : offsetY,

                    "endOffset1" : endOffset1,
                    "endOffset2" : endOffset2,

                    "attached" : attachedBeam,
                    "attachedPoint" : definition.attachedProfileOriginPoint,
                    "attachedManip" : definition.attachedPointsManipulator,

                    "toDelete" : toDelete,

                    "flipped" : definition.flipped
                });

        context->opDeleteBodies(id + "delete", {
                    "entities" : toDelete[]
                });

        const profileName is string = profileData.name;

        context->setFeatureComputedParameter(id, {
                    "name" : "profileName",
                    "value" : profileName
                });

        context->setProperty({
                    "entities" : qCreatedBy(id, EntityType.BODY),
                    "propertyType" : PropertyType.NAME,
                    "value" : profileName
                });

        context->setProperty({
                    "entities" : qCreatedBy(id, EntityType.BODY),
                    "propertyType" : PropertyType.DESCRIPTION,
                    "value" : profileName
                });

        context->doEndFaces(qCreatedBy(id, EntityType.BODY));

        // Custom properties

        const profileNameIds is array = definition.cpProfileName ? cpProfileNameIds->append(definition.cpProfileNameId) : cpProfileNameIds;

        context->setProperty(qCreatedBy(id, EntityType.BODY), profileNameIds, profileName);

        if (profileData.maxLength is number)
        {
            //const longParts is Query = context->getLongParts(qCreatedBy(id) * qAllModifiableSolidBodies(), profileData.maxLength + TOLERANCE.zeroLength * 2);
            const cutlistData is array = context->getCutlist(qCreatedBy(id) * qAllModifiableSolidBodies());
            const maxLength is number = profileData.maxLength + TOLERANCE.zeroLength * 2;

            var longParts is Query = emptyQ;
            for (var beamGroup in cutlistData)
                if (beamGroup.length.value > maxLength)
                    longParts += beamGroup.beam;

            if (longParts != emptyQ)
            {
                context->setErrorEntities(id, {
                            "entities" : longParts
                        });
                if (!featureHasNonTrivialStatus(context, id))
                    context->reportFeatureWarning(id, "Warning: The beam is longer than " ~ maxLength->roundToPrecision(3) ~ "m, which is the longest extrusion length allowed.");
            }
        }
    }, {
            profileOriginPoint : -1,
            attachedProfileOriginPoint : -1,
            profileName : "",

            hasOffset : true,
            offsetX : 0 * meter,
            offsetXOpposite : false,
            offsetY : 0 * meter,
            offsetYOpposite : false,

            cpProfileName : false
        });

export function beamAttachedManipulatorChange(context is Context, definition is map, newManipulators is map) returns map
{
    for (var manip in newManipulators)
    {
        const key is string = manip.key;
        const value is map = manip.value;
        definition = context->updateDefinitionForManip(definition, key, value);
    }
    return definition;
}
FeatureScript 1420;

import(path : "onshape/std/containers.fs", version : "1420.0");
import(path : "onshape/std/feature.fs", version : "1420.0");
import(path : "onshape/std/units.fs", version : "1420.0");

import(path : "onshape/std/booleanoperationtype.gen.fs", version : "1420.0");

import(path : "292004f306ed436c76be47eb", version : "316705980497e6732a50d563");
import(path : "6fb34667b55a246e198a34ad", version : "c67f4998909bab6f0689030f");
import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

// TODO: Check that the beams actually join end-to-end.
// Perhaps by checking that only endFaces touch.
// This won't actually work for cut-extrudes then, which would mean that we then need a outsideFaces selection, but then that comes with its own set of problems.

/**
 * This feature joins beams in the `tools` parameter.
 *
 * @param id : @autocomplete `id + "booleanBeam1"`
 * @param definition {{
 *      @field tools {Query} : The beams to join.
 * }}
 */
annotation { "Feature Type Name" : "Boolean beam",
        "Feature Type Description" : "Add beams together." }
export const beamBoolean = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Beams to merge",
                    "Filter" : EntityType.BODY && BodyType.SOLID && ConstructionObject.NO &&
                        ActiveSheetMetal.NO && ModifiableEntityOnly.YES }
        definition.tools is Query;
    }
    {
        const tools is array = context->evaluateQuery(definition.tools);

        if (@size(tools) == 0)
            throw regenError("Please select beams to merge.", ["tools"]);
        else if (@size(tools) == 1)
            throw regenError("Boolean beam must have at least two beams to merge.", ["tools"], definition.tools);

        const toolsTracking is Query = tools->qUnion() + context->startTracking(tools->qUnion());


        var profile;
        var weldGap;
        var edges = emptyQ;
        var faces = emptyQ;
        for (var beam in tools)
        {
            const bAtt is BeamAttribute = context->getBeamAttribute(beam);

            if (profile == undefined)
                profile = bAtt.profile as BeamProfile;

            // Check that the beams are the same profile
            if (profile != bAtt.profile)
                throw regenError("Beam is different profile.", ["tools"], beam);

            // Union edges for length measurement
            edges += bAtt.lengthEdges->qUnion();
            if (bAtt.lengthFaces != undefined)
                faces += bAtt.lengthFaces;

            if (bAtt.weldGap != undefined)
            {
                if (weldGap == undefined)
                    weldGap = bAtt.weldGap;
                else if (!tolerantEquals(weldGap * meter, bAtt.weldGap * meter))
                    throw regenError("Beam has different weld gap. Was: " ~ bAtt.weldGap * 1000 ~ " mm. Should be: " ~ weldGap * 1000 ~ " mm.", ["tools"], beam);
            }
        }

        context->opBoolean(id + "boolean", {
                    "tools" : tools->qUnion(),
                    "operationType" : BooleanOperationType.UNION
                });

        context->setBeamAttributes(id, {
                    "beams" : toolsTracking,
                    "lengthEdges" : edges,
                    "lengthFaces" : faces,
                    "profile" : profile,
                    "weldGap" : weldGap,
                    "canUseBBox" : false
                });
    });
    FeatureScript 1420;

    import(path : "onshape/std/attributes.fs", version : "1420.0");
    import(path : "onshape/std/box.fs", version : "1420.0");
    import(path : "onshape/std/containers.fs", version : "1420.0");
    import(path : "onshape/std/coordSystem.fs", version : "1420.0");
    import(path : "onshape/std/curveGeometry.fs", version : "1420.0");
    import(path : "onshape/std/evaluate.fs", version : "1420.0");
    import(path : "onshape/std/feature.fs", version : "1420.0");
    import(path : "onshape/std/featureList.fs", version : "1420.0");
    import(path : "onshape/std/math.fs", version : "1420.0");
    import(path : "onshape/std/primitives.fs", version : "1420.0");
    import(path : "onshape/std/properties.fs", version : "1420.0");
    import(path : "onshape/std/string.fs", version : "1420.0");
    import(path : "onshape/std/surfaceGeometry.fs", version : "1420.0");
    import(path : "onshape/std/valueBounds.fs", version : "1420.0");
    import(path : "onshape/std/vector.fs", version : "1420.0");

    import(path : "6fb34667b55a246e198a34ad", version : "c67f4998909bab6f0689030f");
    import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

    export const BEAM_LENGTH_BOUNDS is RealBoundSpec = { (unitless) : [0, 6.5, 500] } as RealBoundSpec;
    export const BEAM_MIN_RADIUS_BOUNDS is RealBoundSpec = { (unitless) : [0, 0, 500000] } as RealBoundSpec;
    export const BEAM_DENSITY_BOUNDS is RealBoundSpec = { (unitless) : [0, 2700, 1e5] } as RealBoundSpec;

    export const HUE_BOUNDS is IntegerBoundSpec = { (unitless) : [0, 0, 360] } as IntegerBoundSpec;
    export const SATURATION_VALUE_BOUNDS is RealBoundSpec = { (unitless) : [0, 0.5, 1] } as RealBoundSpec;

    /**
     * This feature creates a beam profile from the specified sketch
     *
     * @param id : @autocomplete `id + "beamProfileGenerator1"`
     * @param definition {{
     *      @field sketch {FeatureList}     : A [FeatureList] containing the sketch to be made into a profile.
     *      @field origin {Query}           : The origins of the profile. @optional
     *      @field origin9Points {boolean}  : Whether to add standard 9 points to the profile. @optional
     *      @field profileName {string}     : The name of the profile. @optional
     *      @field partNumber {string}      : The part number of the profile. @optional
     *      @field maxLength {number}       : The maximum length of the profile (in m). @optional
     *      @field hasMaterial {boolean}    : Whether to set a material. @optional
     *      @field materialName {string}    : The name of the material. If blank the feature uses `profileName`
     *                                          instead. @optional
     *      @field materialDensity {number} : The density of the material (in kg/m^3). @optional
     * }}
     */
    annotation { "Feature Type Name" : "Beam profile generator",
            "Feature Name Template" : "Profile #profileName",
            "Feature Type Description" : "Create a custom profile to be used for creating beams." ~
                "<ol><li>Select the sketch for the profile.</li>" ~
                "<li>Select the attachment points.</li>" ~
                "<li>Set properties for the profile.</li></ol>" }
    export const beamProfile = defineFeature(function(context is Context, id is Id, definition is map)
        precondition
        {
            annotation { "Name" : "Sketch", "Filter" : SketchObject.YES, "MaxNumberOfPicks" : 1 }
            definition.sketch is FeatureList;

            annotation { "Name" : "Origins", "Filter" : EntityType.VERTEX, "UIHint" : UIHint.ALLOW_QUERY_ORDER, "Description" : "Attachment points for this profile." }
            definition.origin is Query;

            annotation { "Name" : "Add standard 9 points", "Description" : "Add 9 points around the profile and in the centre as attachment points." }
            definition.origin9Points is boolean;

            annotation { "Name" : "Profile name", "Description" : "Name the beams created with this profile. ('#Variable' may be used for configuration)" }
            definition.profileName is string;

            annotation { "Name" : "Part number", "Description" : "Add a part number to beams created with this profile. ('#Variable' may be used for configuration)" }
            definition.partNumber is string;

            annotation { "Name" : "Max length (m)", "Description" : "Limit the length of beams with this profile." }
            isReal(definition.maxLength, BEAM_LENGTH_BOUNDS);

            annotation { "Name" : "Min radius (mm)", "Description" : "Limit the bend radius of beams with this profile." }
            isReal(definition.minRadius, BEAM_MIN_RADIUS_BOUNDS);

            annotation { "Name" : "Set material", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE, "Description" : "Add a material to beams with this profile." }
            definition.hasMaterial is boolean;

            if (definition.hasMaterial)
            {
                annotation { "Group Name" : "Set material", "Collapsed By Default" : false, "Driving Parameter" : "hasMaterial" }
                {
                    annotation { "Name" : "Name", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                    definition.materialName is string;

                    annotation { "Name" : "Density (kg / m^3)", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                    isReal(definition.materialDensity, BEAM_DENSITY_BOUNDS);
                }
            }

            annotation { "Name" : "Set colour", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE, "Description" : "Colour beams created with this profile." }
            definition.hasColour is boolean;

            if (definition.hasColour)
            {
                annotation { "Group Name" : "Set colour", "Collapsed By Default" : false, "Driving Parameter" : "hasColour" }
                {
                    annotation { "Name" : "Hue", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                    isInteger(definition.cHue, HUE_BOUNDS);

                    annotation { "Name" : "Saturation", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                    isReal(definition.cSaturation, SATURATION_VALUE_BOUNDS);

                    annotation { "Name" : "Value", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
                    isReal(definition.cValue, SATURATION_VALUE_BOUNDS);
                }
            }
        }
        {
            if (@size(definition.sketch) == 0)
                throw regenError("Please select a profile sketch.", ["sketch"]);

            if (definition.profileName == "")
            {
                definition.profileName = definition.sketch->keys()[0][0];
                context->reportFeatureWarning(id, "Please choose a profile name. Current auto-generated name is \"" ~ definition.profileName ~ "\"");
            }

            const profileSketchId is Id = definition.sketch->keys()[0];

            // Get the origins
            var profileOrigins3d is array = context->evaluateQuery(definition.origin)->mapArray(function(point is Query) returns Vector
            {
                return context->evVertexPoint({ "vertex" : point });
            });
            if (profileOrigins3d == [])
                profileOrigins3d = [WORLD_ORIGIN];

            var profileFace = context->evaluateQuery(qSketchRegion(profileSketchId, true))->qUnion();
            var facePlane = context->evOwnerSketchPlane({ "entity" : profileFace });

            facePlane.origin = project(facePlane, profileOrigins3d[0]);

            const extraOrigins = getExtraOrigins(facePlane, profileOrigins3d, context->evBox3d({
                            "topology" : profileFace,
                            "tight" : true,
                            "cSys" : facePlane->coordSystem()
                        }), definition.origin9Points);

            const cSys = facePlane->coordSystem();
            const t = cSys->fromWorld();
            const inverseT = cSys->toWorld();

            for (var i = 0; i < @size(extraOrigins); i += 1)
            {
                const point = inverseT * @resize(extraOrigins[i] * meter, 3, 0 * meter);
                context->opPoint(id + "points" + i, {
                            "point" : point
                        });
            }

            if (extraOrigins != [])
            {
                context->setErrorEntities(id, {
                            "entities" : qCreatedBy(id + "points")
                        });
                context->opDeleteBodies(id + "deletePoints", {
                            "entities" : qCreatedBy(id + "points")
                        });
            }

            // Transform the face to the top plane
            profileFace = context->startTracking(profileFace);
            context->opPattern(id + "pattern", {
                        "entities" : qCreatedBy(profileSketchId, EntityType.BODY),
                        "transforms" : [t],
                        "instanceNames" : ["1"]
                    });
            profileFace = context->evaluateQuery(profileFace)->qUnion();

            const allEdges = profileFace->qAdjacent(AdjacencyType.EDGE, EntityType.EDGE);
            const allFaces = allEdges->qAdjacent(AdjacencyType.EDGE, EntityType.FACE);
            const innerFaces = allFaces - profileFace;

            const innerFacesEv = context->evaluateQuery(innerFaces);

            const outerEdges = allEdges - innerFaces->qAdjacent(AdjacencyType.EDGE, EntityType.EDGE);

            const outerEdgePath = context->createProfilePath(outerEdges, id);

            const partNumber = definition.partNumber == "" ? undefined : definition.partNumber;

            const profileName = context->remapVariables(definition.profileName);

            const material = definition.hasMaterial ?
                material(definition.materialName == "" ? profileName : definition.materialName, definition.materialDensity * kilogram / meter ^ 3) :
                undefined;

            var colour = undefined;
            if (definition.hasColour)
            {
                // Algorithm from https://cs.stackexchange.com/questions/64549/convert-hsv-to-rgb-colors
                const hue is number = definition.cHue;
                const saturation is number = definition.cSaturation;
                const value is number = definition.cValue;

                var h = hue / 60;
                if (hue >= 300)
                    h = (hue - 300) / 60;

                var max = value;
                var chroma = saturation * value;
                var min = max - chroma;

                var red;
                var green;
                var blue;

                if (h < 0)
                {
                    red = max;
                    green = min;
                    blue = min - h * chroma;
                }
                else if (h < 1)
                {
                    red = max;
                    green = min + h * chroma;
                    blue = min;
                }
                else if (h < 2)
                {
                    red = min - (h - 2) * chroma;
                    green = max;
                    blue = min;
                }
                else if (h < 3)
                {
                    red = min;
                    green = max;
                    blue = min + (h - 2) * chroma;
                }
                else if (h < 4)
                {
                    red = min;
                    green = min - (h - 4) * chroma;
                    blue = max;
                }
                else if (h < 5)
                {
                    red = min + (h - 4) * chroma;
                    green = min;
                    blue = max;
                }

                colour = color(red, green, blue);

                context->fCuboid(id + "colourCuboid", {
                            "corner1" : vector(-1, -1, -1) * centimeter,
                            "corner2" : vector(1, 1, 1) * centimeter
                        });

                context->setProperty({
                            "entities" : qCreatedBy(id + "colourCuboid", EntityType.BODY),
                            "propertyType" : PropertyType.APPEARANCE,
                            "value" : colour
                        });
            }

            context->setFeatureComputedParameter(id, {
                        "name" : "profileName",
                        "value" : profileName
                    });

            // Process the edges {
            var sequence = [];
            var points = [];
            var prevEdgeData = [];

            for (var i = 0; i < @size(outerEdgePath.edges); i += 1)
            {
                const edge = outerEdgePath.edges[i];
                const flipped = outerEdgePath.flipped[i];
                const edgePoints = outerEdgePath.edgePoints[i];

                prevEdgeData = context->processEdge(edge, flipped, edgePoints, prevEdgeData, i == 0);
                if (prevEdgeData[2])
                {
                    sequence[@size(sequence) - 1] = prevEdgeData[0];
                    points[@size(points) - 1] = prevEdgeData[1];
                }
                else
                {
                    sequence = sequence->append(prevEdgeData[0]);
                    points = points->append(prevEdgeData[1]);
                }
            }

            for (var face in innerFacesEv)
            {
                const innerEdgePath = context->createProfilePath(face->qAdjacent(AdjacencyType.EDGE, EntityType.EDGE), id);

                const connectsToPrevious = {
                        "A" : true,
                        "L" : true,
                        "C" : false,
                        "E" : false,
                        "e" : false
                    };

                prevEdgeData = [];
                for (var i = 0; i < @size(innerEdgePath.edges); i += 1)
                {
                    const edge = innerEdgePath.edges[i];
                    const flipped = innerEdgePath.flipped[i];
                    const edgePoints = innerEdgePath.edgePoints[i];

                    prevEdgeData = context->processEdge(edge, flipped, edgePoints, prevEdgeData, i == 0);

                    if (i == 0 && connectsToPrevious[prevEdgeData[0]] && connectsToPrevious[sequence[@size(sequence) - 1]])
                        sequence = sequence->append("-");

                    if (prevEdgeData[2])
                    {
                        sequence[@size(sequence) - 1] = prevEdgeData[0];
                        points[@size(points) - 1] = prevEdgeData[1];
                    }
                    else
                    {
                        sequence = sequence->append(prevEdgeData[0]);
                        points = points->append(prevEdgeData[1]);
                    }
                }
            }
            // }

            context->opDeleteBodies(id + "deletePattern", {
                        "entities" : qCreatedBy(id + "pattern")
                    });

            // Create the profile
            const out = {
                        "name" : profileName,
                        "partNumber" : partNumber,

                        "points" : points->concatenateArrays()->round(1e-10),
                        "sequence" : join(sequence),
                        "units" : meter,

                        "extraOriginPoints" : extraOrigins == [] ? undefined : extraOrigins->round(1e-10),
                        "material" : material,
                        "colour" : colour,

                        "maxLength" : definition.maxLength <= TOLERANCE.zeroLength ? undefined : definition.maxLength,

                        "minRadius" : definition.minRadius <= TOLERANCE.zeroLength ? undefined : definition.minRadius / 1000
                    } as BeamProfile;

            context->addBeamProfileToVariable(profileSketchId, out);
            context->addBeamProfileToAttribute(profileSketchId, out);

            if (!context->featureHasNonTrivialStatus(id))
                context->reportFeatureInfo(id, "Profile was created successfully with name \"" ~ profileName ~ "\".");
        }, {
                origin : emptyQ,
                origin9Points : false,
                profileName : "",
                partNumber : "",
                maxLength : 0,
                hasMaterial : false,
                materialName : ""
            });

    function round(arr is array, multiple) returns array
    {
        return arr->mapArray(function(num)
            {
                return num->round(multiple);
            });
    }

    function createProfilePath(context is Context, edgesQ is Query, topId is Id) returns map
    {
        var edges = context->evaluateQuery(edgesQ);

        var edgePoints = edges->mapArray(function(edge)
        {
            return context->evEdgeTangentLines({
                            "edge" : edge,
                            "parameters" : [0, 0.5, 1]
                        })->mapArray(function(line)
                {
                    return line.origin;
                });
        });


        var outEdges = [edges[0]];
        var outEdgePoints = [edgePoints[0]];
        var outEdgeFlipped = [false];

        while (@size(outEdges) < @size(edges))
        {
            const index = @size(outEdges) - 1;
            const edgePoint = outEdgePoints[index][outEdgeFlipped[index] ? 0 : 2];

            const nextEdge = context->evaluateQuery((edges->qUnion() - outEdges->qUnion())->qContainsPoint(edgePoint));

            if (@size(nextEdge) != 1)
            {
                context->setErrorEntities(topId, {
                            "entities" : edges->qUnion()->qAdjacent(AdjacencyType.VERTEX, EntityType.VERTEX)->qContainsPoint(edgePoint) // We need a query for setErrorEntities, so we just get the point from here.
                        });
                if (@size(nextEdge) > 1)
                    throw regenError("Point is shared by more than 2 edges.");
                else
                    throw regenError("Edges not coincident at point.");
            }

            const nextIndex = edges->indexOf(nextEdge[0]);

            outEdges = outEdges->append(edges[nextIndex]);
            outEdgePoints = outEdgePoints->append(edgePoints[nextIndex]);
            outEdgeFlipped = outEdgeFlipped->append(!tolerantEquals(edgePoint, edgePoints[nextIndex][0]));
        }

        const edge0Def = context->evCurveDefinition({
                    "edge" : outEdges[0]
                });

        const edgeEndDef = context->evCurveDefinition({
                    "edge" : outEdges[@size(outEdges) - 1]
                });

        if ((edge0Def is Line && edgeEndDef is Line && collinearLines(edge0Def, edgeEndDef)) ||
            (edge0Def is Circle && edgeEndDef is Circle && coincidentCircles(edge0Def, edgeEndDef)))
        {
            // Rotate the array one forwards.
            outEdges = concatenateArrays([[outEdges[@size(outEdges) - 1]], outEdges])->resize(@size(outEdges));
            outEdgePoints = concatenateArrays([[outEdgePoints[@size(outEdgePoints) - 1]], outEdgePoints])->resize(@size(outEdgePoints));
            outEdgeFlipped = concatenateArrays([[outEdgeFlipped[@size(outEdgeFlipped) - 1]], outEdgeFlipped])->resize(@size(outEdgeFlipped));
        }

        return {
                "edges" : outEdges,
                "edgePoints" : outEdgePoints,
                "flipped" : outEdgeFlipped
            };
    }

    function getExtraOrigins(plane is Plane, profileOrigins3d is array, faceBox is Box3d, origin9Points is boolean) returns array
    {
        if (@size(profileOrigins3d) <= 1 && !origin9Points)
            return [];

        var out = [];

        if (origin9Points)
        {
            var xValues = [faceBox.minCorner[0], (faceBox.minCorner[0] + faceBox.maxCorner[0]) / 2, faceBox.maxCorner[0]];
            var yValues = [faceBox.minCorner[1], (faceBox.minCorner[1] + faceBox.maxCorner[1]) / 2, faceBox.maxCorner[1]];
            for (var x = 0; x < 3; x += 1)
                for (var y = 0; y < 3; y += 1)
                {
                    const vec = vector(xValues[x], yValues[y]);
                    if (!tolerantEquals(vec, vector(0 * meter, 0 * meter)))
                        out = append(out, vec);
                }
        }

        for (var origin in profileOrigins3d)
        {
            const vec = plane->worldToPlane(origin);
            if (!tolerantEquals(vec, vector(0 * meter, 0 * meter)))
                out = out->append(vec);
        }

        return out->removeTolDuplicates()->mapArray(function(vec)
            {
                return vec / meter;
            });
    }

    function removeTolDuplicates(arr is array) returns array
    {
        var out = [];
        for (var item in arr)
        {
            var shouldAdd = true;
            for (var outItem in out)
                if (tolerantEquals(item, outItem))
                {
                    shouldAdd = false;
                    break;
                }

            if (shouldAdd)
                out = out->append(item);
        }
        return out;
    }

    function addBeamProfileToVariable(context is Context, profileSketchId is Id, beamProfile is BeamProfile)
    {
        var currentVariable = try silent(context->getVariable("-beamProfileSketchMap"));
        if (!(currentVariable is map))
            currentVariable = {};

        currentVariable[profileSketchId] = beamProfile;
        context->setVariable("-beamProfileSketchMap", currentVariable);
    }

    // The set attribute is not currently used at the moment, but could be in a future version of the beam feature
    function addBeamProfileToAttribute(context is Context, profileSketchId is Id, beamProfile is BeamProfile)
    {
        const parts = qCreatedBy(profileSketchId, EntityType.BODY);
        context->setAttribute({
                    "entities" : parts,
                    "attribute" : beamProfile
                });
    }

    // Returns an array of [EdgeType, EdgePoints]

    /**
     * This function returns `[edgeType, edgePoints, combineWithPrevious, edgeCurve]`
     */
    function processEdge(context is Context, edge is Query, flipped is boolean, edgePoints is array, prevData is array, isStartOfLoop is boolean) returns array
    {
        var edgeTypeString = "";
        const edgeDef = context->evCurveDefinition({ "edge" : edge });
        const startPoint = (flipped ? edgePoints[2] : edgePoints[0]) / meter;
        const midPoint = edgePoints[1] / meter;
        const endPoint = (flipped ? edgePoints[0] : edgePoints[2]) / meter;

        var edgePointData = [];

        var replace = false;

        if (edgeDef is Line)
        {
            edgeTypeString = "L";

            if (isStartOfLoop)
                edgePointData = [startPoint[0], startPoint[1], endPoint[0], endPoint[1]];
            else if (prevData[3] is Line && collinearLines(prevData[3], edgeDef))
            { // We continue on the previous line. It will always have the exact same endpoint.
                replace = true;
                if (size(prevData[1]) == 4)
                    edgePointData = [prevData[1][0], prevData[1][1], endPoint[0], endPoint[1]];
                else
                    edgePointData = [endPoint[0], endPoint[1]];
            }
            else
                edgePointData = [endPoint[0], endPoint[1]];

        }

        if (edgeDef is Circle)
        {
            if (tolerantEquals(startPoint, endPoint)) // start and end the same equals full circle
            {
                edgeTypeString = "C";

                edgePointData = [edgeDef.coordSystem.origin[0].value, edgeDef.coordSystem.origin[1].value, edgeDef.radius.value];
            }
            else
            {
                edgeTypeString = "A";

                if (isStartOfLoop)
                    edgePointData = [startPoint[0], startPoint[1], midPoint[0], midPoint[1], endPoint[0], endPoint[1]];
                else if (prevData[0] == "A" && coincidentCircles(prevData[3], edgeDef))
                {
                    replace = true;
                    if (size(prevData[1]) == 6)
                        edgePointData = [prevData[1][0], prevData[1][1], midPoint[0], midPoint[1], endPoint[0], endPoint[1]];
                    else
                        edgePointData = [midPoint[0], midPoint[1], endPoint[0], endPoint[1]];
                }
                else
                    edgePointData = [midPoint[0], midPoint[1], endPoint[0], endPoint[1]];

            }
        }

        if (edgeDef is Ellipse)
        {
            var cSys = edgeDef.coordSystem;
            if (tolerantEquals(startPoint, endPoint)) // start and end the same equals full ellipse
            {
                edgeTypeString = "E";

                edgePointData = [
                        cSys.origin[0].value, cSys.origin[1].value,
                        cSys.xAxis[0], cSys.xAxis[1],
                        edgeDef.majorRadius.value,
                        edgeDef.minorRadius.value
                    ];
            }
            else
            {
                edgeTypeString = "e";
                const p1y = dot(yAxis(cSys), (startPoint * meter - cSys.origin) / edgeDef.minorRadius);
                const p1x = dot(cSys.xAxis, (startPoint * meter - cSys.origin) / edgeDef.majorRadius);

                const p2y = dot(yAxis(cSys), (endPoint * meter - cSys.origin) / edgeDef.minorRadius);
                const p2x = dot(cSys.xAxis, (endPoint * meter - cSys.origin) / edgeDef.majorRadius);
                var p1 = atan2(p1y, p1x) / (2 * PI * radian);
                if (p1 < 0)
                    p1 = p1 + 1;
                var p2 = atan2(p2y, p2x) / (2 * PI * radian);
                if (p2 < 0)
                    p2 = p2 + 1;
                edgePointData = [
                        cSys.origin[0].value, cSys.origin[1].value,
                        cSys.xAxis[0], cSys.xAxis[1],
                        edgeDef.majorRadius.value,
                        edgeDef.minorRadius.value,
                        p1, p2,
                        endPoint[0], endPoint[1]];
            }
        }

        if (edgeTypeString == "")
            throw regenError("Edge is not line, arc, circle or ellipse.", edge);

        return [edgeTypeString, edgePointData, replace, edgeDef];
    }
    FeatureScript 1420;

    import(path : "onshape/std/containers.fs", version : "1420.0");
    import(path : "onshape/std/feature.fs", version : "1420.0");
    import(path : "onshape/std/math.fs", version : "1420.0");
    import(path : "onshape/std/properties.fs", version : "1420.0");
    import(path : "onshape/std/string.fs", version : "1420.0");
    import(path : "onshape/std/table.fs", version : "1420.0");
    import(path : "onshape/std/valueBounds.fs", version : "1420.0");

    import(path : "292004f306ed436c76be47eb", version : "316705980497e6732a50d563");
    import(path : "461abf12c4538821ba44202e", version : "dc48c187b3b505a05d4725f5");
    import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

    ICON::import(path : "ef3abca5caad71bf51fc91d8", version : "a2f38cbdde8885c35f49922c");

    annotation { "Feature Type Name" : "Cutlist",
            "Icon" : ICON::BLOB_DATA,
            "Feature Type Description" : "Fill out length, quantity and end angle properties." }
    export const cutlist = defineFeature(function(context is Context, id is Id, definition is map)
        precondition
        {
            annotation { "Name" : "Length", "Column Name" : "Length", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.FIRST_IN_ROW, UIHint.REMEMBER_PREVIOUS_VALUE],
                        "Description" : "Fill out the length custom property if it wasn't programmed." }
            definition.cpLength is boolean;

            if (definition.cpLength)
                annotation { "Name" : "Length", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.REMEMBER_PREVIOUS_VALUE], "MaxLength" : 24 }
                definition.cpLengthId is string;


            annotation { "Name" : "Quantity", "Column Name" : "Quantity", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.FIRST_IN_ROW, UIHint.REMEMBER_PREVIOUS_VALUE],
                        "Description" : "Fill out the quantity custom property if it wasn't programmed." }
            definition.cpQuantity is boolean;

            if (definition.cpQuantity)
                annotation { "Name" : "Quantity", "UIHint" : [UIHint.DISPLAY_SHORT, UIHint.REMEMBER_PREVIOUS_VALUE], "MaxLength" : 24 }
                definition.cpQuantityId is string;


            annotation { "Name" : "End Angles", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE,
                        "Description" : "Fill out the end angle custom properties if it wasn't programmed." }
            definition.cpAngles is boolean;

            if (definition.cpAngles)
            {
                annotation { "Name" : "Angle 1", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE, "MaxLength" : 24 }
                definition.cpAngle1Id is string;

                annotation { "Name" : "Angle 2", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE, "MaxLength" : 24 }
                definition.cpAngle2Id is string;
            }
        }
        {
            if (definition.cpQuantity)
                definition->checkPropertyId("cpQuantityId");

            if (definition.cpLength)
                definition->checkPropertyId("cpLengthId");

            if (definition.cpAngles)
            {
                definition->checkPropertyId("cpAngle1Id");
                definition->checkPropertyId("cpAngle2Id");
            }

            const beamGroups = context->getCutlist(qAllModifiableSolidBodies(), true, true, false);

            if (beamGroups == [])
            {
                context->reportFeatureInfo(id, "No beams were found.");
                return;
            }

            var hasApproximation = false;
            for (var group in beamGroups)
                if (group.approximation)
                {
                    hasApproximation = true;
                    break;
                }

            if (hasApproximation)
                context->reportFeatureInfo(id, "Beams that have an approximate length are marked with an asterisk.");

            // Work out the ids that we need to use. If the user requested a special property id, add it to the list
            const lengthIds = definition.cpLength ? cpLengthIds->append(definition.cpLengthId) : cpLengthIds;
            const quantityIds = definition.cpQuantity ? cpQuantityIds->append(definition.cpQuantityId) : cpQuantityIds;
            const angle1Ids = definition.cpAngles ? cpAngle1Ids->append(definition.cpAngle1Id) : cpAngle1Ids;
            const angle2Ids = definition.cpAngles ? cpAngle2Ids->append(definition.cpAngle2Id) : cpAngle2Ids;

            for (var beamGroup in beamGroups)
            {
                context->setProperty({
                            "entities" : beamGroup.beam,
                            "propertyType" : PropertyType.NAME,
                            "value" : beamGroup.profile ~ " - " ~ beamGroup.formattedLength
                        });

                context->setProperty(beamGroup.beam, lengthIds, beamGroup.formattedLength);
                context->setProperty(beamGroup.beam, quantityIds, beamGroup.quantity->toString());

                context->setProperty(beamGroup.beam, angle1Ids, beamGroup.angles[0]->roundToPrecision(DP)->toString());
                context->setProperty(beamGroup.beam, angle2Ids, beamGroup.angles[1]->roundToPrecision(DP)->toString());
            }
        });


    annotation { "Table Type Name" : "Cutlist", "Icon" : ICON::BLOB_DATA }
    export const cutlistTable = defineTable(function(context is Context, definition is map) returns Table
        precondition
        {
        }
        {
            const columnDefinitions = [
                    // tableColumnDefinition("entities", "Beams"),
                    tableColumnDefinition("profile", "Profile", TableTextAlignment.CENTER),
                    tableColumnDefinition("length", "Length", TableTextAlignment.CENTER),
                    tableColumnDefinition("angle1", "Angle 1", TableTextAlignment.CENTER),
                    tableColumnDefinition("angle2", "Angle 2", TableTextAlignment.CENTER),
                    tableColumnDefinition("quantity", "Quantity", TableTextAlignment.CENTER),
                ];

            const beamGroups = context->getCutlist(qAllModifiableSolidBodies(), true, true, true);

            var beamGroupsTable = [];

            for (var beamGroup in beamGroups)
            {
                var row = {
                    // "entities" : beamGroup.beam,
                    "profile" : beamGroup.profile,
                    "length" : beamGroup.formattedLength,
                    "angle1" : beamGroup.angles[0] * degree,
                    "angle2" : beamGroup.angles[1] * degree,
                    "quantity" : beamGroup.quantity,
                };
                if (beamGroup.anglesOverridden[0] != undefined)
                    row.angle1 = tableCellError(row.angle1, "Angle in property is different (" ~ beamGroup.anglesOverridden[0] ~ " deg)");

                if (beamGroup.anglesOverridden[1] != undefined)
                    row.angle2 = tableCellError(row.angle2, "Angle in property is different (" ~ beamGroup.anglesOverridden[1] ~ " deg)");

                beamGroupsTable = beamGroupsTable->append(tableRow(row, beamGroup.beam));
            }

            const result is Table = table("Cutlist", columnDefinitions, beamGroupsTable);
            // println(result);
            return result;
        });

    /*
       function printCSV(csv is array)
       {
       for (var row in csv)
       {
       if (row != [])
       {
       print(escapeCSV(row[0]));
       for (var i = 1; i < @size(row); i += 1)
       print("," ~ escapeCSV(row[i]));
       }

       println("");
       }
       }

       function escapeCSV(s) returns string
       {
       s = toString(s);
       // Check for quotes
       const replacedString = replace(s, '"', '""');
       if (replacedString != s)
       return '"' ~ replacedString ~ '"';

       if (replace(s, ",", "") != s)
       return '"' ~ s ~ '"';

       return s;
       }
     */
       FeatureScript 1420;

       import(path : "onshape/std/feature.fs", version : "1420.0");
       import(path : "onshape/std/units.fs", version : "1420.0");
       import(path : "onshape/std/valueBounds.fs", version : "1420.0");

       import(path : "onshape/std/geometry.fs", version : "1420.0");

       import(path : "292004f306ed436c76be47eb", version : "316705980497e6732a50d563");
       import(path : "5f9b7e7b3552581bf2500485", version : "9f551983b6a851688d030923");

       ICON::import(path : "18d2fb2936d1b08e97191d99", version : "38b792bda1f603198292b874");

       /**
        * This feature joins beams in the `tools` parameter.
        *
        * @param id : @autocomplete `id + "booleanBeam1"`
        * @param definition {{
        *      @field tools {Query} : The beams to join.
        * }}
        */
       annotation { "Feature Type Name" : "End cap",
               "Editing Logic Function" : "beamEndCapEditLogic",
               "Icon" : ICON::BLOB_DATA,
               "Feature Type Description" : "Create an end cap on a beam or part." }
       export const beamEndCap = defineFeature(function(context is Context, id is Id, definition is map)
           precondition
           {
               annotation { "Name" : "End faces",
                           "Filter" : EntityType.FACE && BodyType.SOLID && ConstructionObject.NO &&
                               ActiveSheetMetal.NO && ModifiableEntityOnly.YES && GeometryType.PLANE }
               definition.faces is Query;

               annotation { "Name" : "Inset", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE, "Description" : "How far to offset the outside from the edge of face." }
               isLength(definition.offset, ZERO_INCLUSIVE_OFFSET_BOUNDS);

               annotation { "Name" : "Thickness", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE, "Description" : "The thickness of the cap." }
               isLength(definition.thickness, BLEND_BOUNDS);

               annotation { "Name" : "Fillet radius", "UIHint" : UIHint.REMEMBER_PREVIOUS_VALUE }
               isLength(definition.radius, ZERO_INCLUSIVE_OFFSET_BOUNDS);

           }
           {
               const faces is array = context->evaluateQuery(definition.faces);

               if (@size(faces) == 0)
                   throw regenError("Please select end faces to cap.", ["faces"]);

               var toDelete is Query = emptyQ;

               var count is number = 0;
               for (var face in faces)
               {
                   const beam is Query = face->qOwnerBody();

                   // const beamAttribute is BeamAttribute = context->getBeamAttribute(beam);

                   const id is Id = id + count->unstableIdComponent();
                   context->setExternalDisambiguation(id, face);

                   toDelete += qCreatedBy(id + "sk");

                   // This is a very easy trick to get a face to extrude using the sketch imprint
                   const sk is Sketch = context->newSketch(id + "sk", {
                               "sketchPlane" : face
                           });
                   sk->skSolve();

                   const direction is Vector = context->evPlane({ "face" : face }).normal;

                   context->opExtrude(id + "skExtrude", {
                               "entities" : qCreatedBy(id + "sk", EntityType.FACE),
                               "direction" : direction,
                               "endBound" : BoundingType.BLIND,
                               "endDepth" : definition.thickness
                           });

                   const faces is Query = qCreatedBy(id + "skExtrude", EntityType.FACE);

                   var sideFaces is Query = context->evaluateQuery(qNonCapEntity(id + "skExtrude", EntityType.FACE))->qUnion();
                   sideFaces += context->startTracking(sideFaces);

                   const facesToDelete is Query = faces->qGeometry(GeometryType.EXTRUDED) +
                       context->evaluateQuery(faces->qGeometry(GeometryType.CYLINDER))->filter(function(face)
                               {
                                   if (@size(context->evaluateQuery(
                                                   face->qAdjacent(AdjacencyType.EDGE, EntityType.FACE)->qGeometry(GeometryType.PLANE) *
                                                   face->qTangentConnectedFaces()
                                               )) != 2)
                                       return false;
                                   return true;
                               })->qUnion();

                   if (context->evaluateQuery(facesToDelete) != [])
                       context->opDeleteFace(id + "delete", {
                                   "deleteFaces" : facesToDelete,
                                   "includeFillet" : false,
                                   "capVoid" : false,
                                   "leaveOpen" : false
                               });

                   if (!tolerantEquals(definition.offset, 0 * meter))
                       context->opOffsetFace(id + "offset", {
                                   "moveFaces" : sideFaces,
                                   "offsetDistance" : -definition.offset
                               });

                   if (!tolerantEquals(definition.radius, 0 * meter))
                   {
                       const q is Query = qCreatedBy(id + "skExtrude", EntityType.BODY)->qOwnedByBody(EntityType.EDGE) - qCapEntity(id + "skExtrude", CapType.EITHER);
                       if (context->evaluateQuery(q) != [])
                           context->opFillet(id + "fillet", {
                                       "entities" : q,
                                       "radius" : definition.radius
                                   });
                   }
                   count += 1;
               }

               context->opDeleteBodies(id + "delete", {
                           "entities" : toDelete
                       });

               const name is string = roundToPrecision(definition.thickness / millimeter, 2) ~ " mm End Cap";

               context->setProperty({
                           "entities" : qCreatedBy(id, EntityType.BODY),
                           "propertyType" : PropertyType.NAME,
                           "value" : name
                       });

               context->setProperty({
                           "entities" : qCreatedBy(id, EntityType.BODY),
                           "propertyType" : PropertyType.DESCRIPTION,
                           "value" : name
                       });
           });

       export function beamEndCapEditLogic(context is Context, id is Id, oldDefinition is map, definition is map, specifiedParameters is map) returns map
       {
           if (!specifiedParameters.offset &&
               context->evaluateQuery(definition.faces) != [] &&
               (oldDefinition == {} || context->evaluateQuery(oldDefinition.faces) == [])) // Only on first selection
               try silent
               {
                   const profile is BeamProfile = context->getBeamProfile(definition.faces->qOwnerBody()->qNthElement(0));
                   if (profile.data is map && profile.data.t is number)
                       definition.offset = profile.data.t * millimeter;
               }
           return definition;
       }

