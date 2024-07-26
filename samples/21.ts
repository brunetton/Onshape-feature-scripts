// https://cad.onshape.com/documents/6b640a407d78066bd5e41c7a/w/4693805578a72f40ebfb4ea3/e/c953720c264ce001f1a82dc1

FeatureScript 422;
import(path : "onshape/std/geometry.fs", version : "422.0");

export import(path : "e57f8207821a47f07cf1aecf/eba680d96925ad9d549b2924/09b03e7e778d6671aebb9e4b", version : "6914b0329474b9fd962016f8");
/**
 *
 * Screw Creator
 *
 *    ISO/ANSI
 *    Multi Start
 *    Lead in tapers
 *    Internal and External Threads
 *    Standard, Square, and Trapezoidal threads
 *    Auto-thread naming,both iso and ansi
 *    Left and Right handed threads
 *
 *    <Future> : Select both major and minor diameter as the provided basis
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Parametric Products Intellectual Holdings, LLC ("PPIH") and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Parametric Products Intellectual Holdings, LLC
 * and its suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Parametric Products Intellectual Holdings, LLC.
 *
 **/

annotation { "Feature Type Name" : "ThreadCreator", "Feature Type Description": "Create standard and customized ISO/ANSI threads, square, multistart, and buttress, left and right handed.", "Feature Name Template" : "#screwfriendlyname", "Editing Logic Function" : "screwEditLogic" }
export const threadCreator = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        pp_threadCreatorPredicate(definition );
    }
    {
        var myId = id + "threads";
        createThread(context, myId, definition);

    }, {

         "internalThreads" : true,
         "leadInPitches" : 0.5
    }
);