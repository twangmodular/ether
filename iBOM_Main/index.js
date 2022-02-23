(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*! Split.js - v1.3.5 */

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.Split = factory());
}(this, (function () { 'use strict';

// The programming goals of Split.js are to deliver readable, understandable and
// maintainable code, while at the same time manually optimizing for tiny minified file size,
// browser compatibility without additional requirements, graceful fallback (IE8 is supported)
// and very few assumptions about the user's page layout.
var global = window;
var document = global.document;

// Save a couple long function names that are used frequently.
// This optimization saves around 400 bytes.
var addEventListener = 'addEventListener';
var removeEventListener = 'removeEventListener';
var getBoundingClientRect = 'getBoundingClientRect';
var NOOP = function () { return false; };

// Figure out if we're in IE8 or not. IE8 will still render correctly,
// but will be static instead of draggable.
var isIE8 = global.attachEvent && !global[addEventListener];

// This library only needs two helper functions:
//
// The first determines which prefixes of CSS calc we need.
// We only need to do this once on startup, when this anonymous function is called.
//
// Tests -webkit, -moz and -o prefixes. Modified from StackOverflow:
// http://stackoverflow.com/questions/16625140/js-feature-detection-to-detect-the-usage-of-webkit-calc-over-calc/16625167#16625167
var calc = (['', '-webkit-', '-moz-', '-o-'].filter(function (prefix) {
    var el = document.createElement('div');
    el.style.cssText = "width:" + prefix + "calc(9px)";

    return (!!el.style.length)
}).shift()) + "calc";

// The second helper function allows elements and string selectors to be used
// interchangeably. In either case an element is returned. This allows us to
// do `Split([elem1, elem2])` as well as `Split(['#id1', '#id2'])`.
var elementOrSelector = function (el) {
    if (typeof el === 'string' || el instanceof String) {
        return document.querySelector(el)
    }

    return el
};

// The main function to initialize a split. Split.js thinks about each pair
// of elements as an independant pair. Dragging the gutter between two elements
// only changes the dimensions of elements in that pair. This is key to understanding
// how the following functions operate, since each function is bound to a pair.
//
// A pair object is shaped like this:
//
// {
//     a: DOM element,
//     b: DOM element,
//     aMin: Number,
//     bMin: Number,
//     dragging: Boolean,
//     parent: DOM element,
//     isFirst: Boolean,
//     isLast: Boolean,
//     direction: 'horizontal' | 'vertical'
// }
//
// The basic sequence:
//
// 1. Set defaults to something sane. `options` doesn't have to be passed at all.
// 2. Initialize a bunch of strings based on the direction we're splitting.
//    A lot of the behavior in the rest of the library is paramatized down to
//    rely on CSS strings and classes.
// 3. Define the dragging helper functions, and a few helpers to go with them.
// 4. Loop through the elements while pairing them off. Every pair gets an
//    `pair` object, a gutter, and special isFirst/isLast properties.
// 5. Actually size the pair elements, insert gutters and attach event listeners.
var Split = function (ids, options) {
    if ( options === void 0 ) options = {};

    var dimension;
    var clientDimension;
    var clientAxis;
    var position;
    var paddingA;
    var paddingB;
    var elements;

    // All DOM elements in the split should have a common parent. We can grab
    // the first elements parent and hope users read the docs because the
    // behavior will be whacky otherwise.
    var parent = elementOrSelector(ids[0]).parentNode;
    var parentFlexDirection = global.getComputedStyle(parent).flexDirection;

    // Set default options.sizes to equal percentages of the parent element.
    var sizes = options.sizes || ids.map(function () { return 100 / ids.length; });

    // Standardize minSize to an array if it isn't already. This allows minSize
    // to be passed as a number.
    var minSize = options.minSize !== undefined ? options.minSize : 100;
    var minSizes = Array.isArray(minSize) ? minSize : ids.map(function () { return minSize; });
    var gutterSize = options.gutterSize !== undefined ? options.gutterSize : 10;
    var snapOffset = options.snapOffset !== undefined ? options.snapOffset : 30;
    var direction = options.direction || 'horizontal';
    var cursor = options.cursor || (direction === 'horizontal' ? 'ew-resize' : 'ns-resize');
    var gutter = options.gutter || (function (i, gutterDirection) {
        var gut = document.createElement('div');
        gut.className = "gutter gutter-" + gutterDirection;
        return gut
    });
    var elementStyle = options.elementStyle || (function (dim, size, gutSize) {
        var style = {};

        if (typeof size !== 'string' && !(size instanceof String)) {
            if (!isIE8) {
                style[dim] = calc + "(" + size + "% - " + gutSize + "px)";
            } else {
                style[dim] = size + "%";
            }
        } else {
            style[dim] = size;
        }

        return style
    });
    var gutterStyle = options.gutterStyle || (function (dim, gutSize) { return (( obj = {}, obj[dim] = (gutSize + "px"), obj ))
        var obj; });

    // 2. Initialize a bunch of strings based on the direction we're splitting.
    // A lot of the behavior in the rest of the library is paramatized down to
    // rely on CSS strings and classes.
    if (direction === 'horizontal') {
        dimension = 'width';
        clientDimension = 'clientWidth';
        clientAxis = 'clientX';
        position = 'left';
        paddingA = 'paddingLeft';
        paddingB = 'paddingRight';
    } else if (direction === 'vertical') {
        dimension = 'height';
        clientDimension = 'clientHeight';
        clientAxis = 'clientY';
        position = 'top';
        paddingA = 'paddingTop';
        paddingB = 'paddingBottom';
    }

    // 3. Define the dragging helper functions, and a few helpers to go with them.
    // Each helper is bound to a pair object that contains it's metadata. This
    // also makes it easy to store references to listeners that that will be
    // added and removed.
    //
    // Even though there are no other functions contained in them, aliasing
    // this to self saves 50 bytes or so since it's used so frequently.
    //
    // The pair object saves metadata like dragging state, position and
    // event listener references.

    function setElementSize (el, size, gutSize) {
        // Split.js allows setting sizes via numbers (ideally), or if you must,
        // by string, like '300px'. This is less than ideal, because it breaks
        // the fluid layout that `calc(% - px)` provides. You're on your own if you do that,
        // make sure you calculate the gutter size by hand.
        var style = elementStyle(dimension, size, gutSize);

        // eslint-disable-next-line no-param-reassign
        Object.keys(style).forEach(function (prop) { return (el.style[prop] = style[prop]); });
    }

    function setGutterSize (gutterElement, gutSize) {
        var style = gutterStyle(dimension, gutSize);

        // eslint-disable-next-line no-param-reassign
        Object.keys(style).forEach(function (prop) { return (gutterElement.style[prop] = style[prop]); });
    }

    // Actually adjust the size of elements `a` and `b` to `offset` while dragging.
    // calc is used to allow calc(percentage + gutterpx) on the whole split instance,
    // which allows the viewport to be resized without additional logic.
    // Element a's size is the same as offset. b's size is total size - a size.
    // Both sizes are calculated from the initial parent percentage,
    // then the gutter size is subtracted.
    function adjust (offset) {
        var a = elements[this.a];
        var b = elements[this.b];
        var percentage = a.size + b.size;

        a.size = (offset / this.size) * percentage;
        b.size = (percentage - ((offset / this.size) * percentage));

        setElementSize(a.element, a.size, this.aGutterSize);
        setElementSize(b.element, b.size, this.bGutterSize);
    }

    // drag, where all the magic happens. The logic is really quite simple:
    //
    // 1. Ignore if the pair is not dragging.
    // 2. Get the offset of the event.
    // 3. Snap offset to min if within snappable range (within min + snapOffset).
    // 4. Actually adjust each element in the pair to offset.
    //
    // ---------------------------------------------------------------------
    // |    | <- a.minSize               ||              b.minSize -> |    |
    // |    |  | <- this.snapOffset      ||     this.snapOffset -> |  |    |
    // |    |  |                         ||                        |  |    |
    // |    |  |                         ||                        |  |    |
    // ---------------------------------------------------------------------
    // | <- this.start                                        this.size -> |
    function drag (e) {
        var offset;

        if (!this.dragging) { return }

        // Get the offset of the event from the first side of the
        // pair `this.start`. Supports touch events, but not multitouch, so only the first
        // finger `touches[0]` is counted.
        if ('touches' in e) {
            offset = e.touches[0][clientAxis] - this.start;
        } else {
            offset = e[clientAxis] - this.start;
        }

        // If within snapOffset of min or max, set offset to min or max.
        // snapOffset buffers a.minSize and b.minSize, so logic is opposite for both.
        // Include the appropriate gutter sizes to prevent overflows.
        if (offset <= elements[this.a].minSize + snapOffset + this.aGutterSize) {
            offset = elements[this.a].minSize + this.aGutterSize;
        } else if (offset >= this.size - (elements[this.b].minSize + snapOffset + this.bGutterSize)) {
            offset = this.size - (elements[this.b].minSize + this.bGutterSize);
        }

        // Actually adjust the size.
        adjust.call(this, offset);

        // Call the drag callback continously. Don't do anything too intensive
        // in this callback.
        if (options.onDrag) {
            options.onDrag();
        }
    }

    // Cache some important sizes when drag starts, so we don't have to do that
    // continously:
    //
    // `size`: The total size of the pair. First + second + first gutter + second gutter.
    // `start`: The leading side of the first element.
    //
    // ------------------------------------------------
    // |      aGutterSize -> |||                      |
    // |                     |||                      |
    // |                     |||                      |
    // |                     ||| <- bGutterSize       |
    // ------------------------------------------------
    // | <- start                             size -> |
    function calculateSizes () {
        // Figure out the parent size minus padding.
        var a = elements[this.a].element;
        var b = elements[this.b].element;

        this.size = a[getBoundingClientRect]()[dimension] + b[getBoundingClientRect]()[dimension] + this.aGutterSize + this.bGutterSize;
        this.start = a[getBoundingClientRect]()[position];
    }

    // stopDragging is very similar to startDragging in reverse.
    function stopDragging () {
        var self = this;
        var a = elements[self.a].element;
        var b = elements[self.b].element;

        if (self.dragging && options.onDragEnd) {
            options.onDragEnd();
        }

        self.dragging = false;

        // Remove the stored event listeners. This is why we store them.
        global[removeEventListener]('mouseup', self.stop);
        global[removeEventListener]('touchend', self.stop);
        global[removeEventListener]('touchcancel', self.stop);

        self.parent[removeEventListener]('mousemove', self.move);
        self.parent[removeEventListener]('touchmove', self.move);

        // Delete them once they are removed. I think this makes a difference
        // in memory usage with a lot of splits on one page. But I don't know for sure.
        delete self.stop;
        delete self.move;

        a[removeEventListener]('selectstart', NOOP);
        a[removeEventListener]('dragstart', NOOP);
        b[removeEventListener]('selectstart', NOOP);
        b[removeEventListener]('dragstart', NOOP);

        a.style.userSelect = '';
        a.style.webkitUserSelect = '';
        a.style.MozUserSelect = '';
        a.style.pointerEvents = '';

        b.style.userSelect = '';
        b.style.webkitUserSelect = '';
        b.style.MozUserSelect = '';
        b.style.pointerEvents = '';

        self.gutter.style.cursor = '';
        self.parent.style.cursor = '';
    }

    // startDragging calls `calculateSizes` to store the inital size in the pair object.
    // It also adds event listeners for mouse/touch events,
    // and prevents selection while dragging so avoid the selecting text.
    function startDragging (e) {
        // Alias frequently used variables to save space. 200 bytes.
        var self = this;
        var a = elements[self.a].element;
        var b = elements[self.b].element;

        // Call the onDragStart callback.
        if (!self.dragging && options.onDragStart) {
            options.onDragStart();
        }

        // Don't actually drag the element. We emulate that in the drag function.
        e.preventDefault();

        // Set the dragging property of the pair object.
        self.dragging = true;

        // Create two event listeners bound to the same pair object and store
        // them in the pair object.
        self.move = drag.bind(self);
        self.stop = stopDragging.bind(self);

        // All the binding. `window` gets the stop events in case we drag out of the elements.
        global[addEventListener]('mouseup', self.stop);
        global[addEventListener]('touchend', self.stop);
        global[addEventListener]('touchcancel', self.stop);

        self.parent[addEventListener]('mousemove', self.move);
        self.parent[addEventListener]('touchmove', self.move);

        // Disable selection. Disable!
        a[addEventListener]('selectstart', NOOP);
        a[addEventListener]('dragstart', NOOP);
        b[addEventListener]('selectstart', NOOP);
        b[addEventListener]('dragstart', NOOP);

        a.style.userSelect = 'none';
        a.style.webkitUserSelect = 'none';
        a.style.MozUserSelect = 'none';
        a.style.pointerEvents = 'none';

        b.style.userSelect = 'none';
        b.style.webkitUserSelect = 'none';
        b.style.MozUserSelect = 'none';
        b.style.pointerEvents = 'none';

        // Set the cursor, both on the gutter and the parent element.
        // Doing only a, b and gutter causes flickering.
        self.gutter.style.cursor = cursor;
        self.parent.style.cursor = cursor;

        // Cache the initial sizes of the pair.
        calculateSizes.call(self);
    }

    // 5. Create pair and element objects. Each pair has an index reference to
    // elements `a` and `b` of the pair (first and second elements).
    // Loop through the elements while pairing them off. Every pair gets a
    // `pair` object, a gutter, and isFirst/isLast properties.
    //
    // Basic logic:
    //
    // - Starting with the second element `i > 0`, create `pair` objects with
    //   `a = i - 1` and `b = i`
    // - Set gutter sizes based on the _pair_ being first/last. The first and last
    //   pair have gutterSize / 2, since they only have one half gutter, and not two.
    // - Create gutter elements and add event listeners.
    // - Set the size of the elements, minus the gutter sizes.
    //
    // -----------------------------------------------------------------------
    // |     i=0     |         i=1         |        i=2       |      i=3     |
    // |             |       isFirst       |                  |     isLast   |
    // |           pair 0                pair 1             pair 2           |
    // |             |                     |                  |              |
    // -----------------------------------------------------------------------
    var pairs = [];
    elements = ids.map(function (id, i) {
        // Create the element object.
        var element = {
            element: elementOrSelector(id),
            size: sizes[i],
            minSize: minSizes[i],
        };

        var pair;

        if (i > 0) {
            // Create the pair object with it's metadata.
            pair = {
                a: i - 1,
                b: i,
                dragging: false,
                isFirst: (i === 1),
                isLast: (i === ids.length - 1),
                direction: direction,
                parent: parent,
            };

            // For first and last pairs, first and last gutter width is half.
            pair.aGutterSize = gutterSize;
            pair.bGutterSize = gutterSize;

            if (pair.isFirst) {
                pair.aGutterSize = gutterSize / 2;
            }

            if (pair.isLast) {
                pair.bGutterSize = gutterSize / 2;
            }

            // if the parent has a reverse flex-direction, switch the pair elements.
            if (parentFlexDirection === 'row-reverse' || parentFlexDirection === 'column-reverse') {
                var temp = pair.a;
                pair.a = pair.b;
                pair.b = temp;
            }
        }

        // Determine the size of the current element. IE8 is supported by
        // staticly assigning sizes without draggable gutters. Assigns a string
        // to `size`.
        //
        // IE9 and above
        if (!isIE8) {
            // Create gutter elements for each pair.
            if (i > 0) {
                var gutterElement = gutter(i, direction);
                setGutterSize(gutterElement, gutterSize);

                gutterElement[addEventListener]('mousedown', startDragging.bind(pair));
                gutterElement[addEventListener]('touchstart', startDragging.bind(pair));

                parent.insertBefore(gutterElement, element.element);

                pair.gutter = gutterElement;
            }
        }

        // Set the element size to our determined size.
        // Half-size gutters for first and last elements.
        if (i === 0 || i === ids.length - 1) {
            setElementSize(element.element, element.size, gutterSize / 2);
        } else {
            setElementSize(element.element, element.size, gutterSize);
        }

        var computedSize = element.element[getBoundingClientRect]()[dimension];

        if (computedSize < element.minSize) {
            element.minSize = computedSize;
        }

        // After the first iteration, and we have a pair object, append it to the
        // list of pairs.
        if (i > 0) {
            pairs.push(pair);
        }

        return element
    });

    function setSizes (newSizes) {
        newSizes.forEach(function (newSize, i) {
            if (i > 0) {
                var pair = pairs[i - 1];
                var a = elements[pair.a];
                var b = elements[pair.b];

                a.size = newSizes[i - 1];
                b.size = newSize;

                setElementSize(a.element, a.size, pair.aGutterSize);
                setElementSize(b.element, b.size, pair.bGutterSize);
            }
        });
    }

    function destroy () {
        pairs.forEach(function (pair) {
            pair.parent.removeChild(pair.gutter);
            elements[pair.a].element.style[dimension] = '';
            elements[pair.b].element.style[dimension] = '';
        });
    }

    if (isIE8) {
        return {
            setSizes: setSizes,
            destroy: destroy,
        }
    }

    return {
        setSizes: setSizes,
        getSizes: function getSizes () {
            return elements.map(function (element) { return element.size; })
        },
        collapse: function collapse (i) {
            if (i === pairs.length) {
                var pair = pairs[i - 1];

                calculateSizes.call(pair);

                if (!isIE8) {
                    adjust.call(pair, pair.size - pair.bGutterSize);
                }
            } else {
                var pair$1 = pairs[i];

                calculateSizes.call(pair$1);

                if (!isIE8) {
                    adjust.call(pair$1, pair$1.aGutterSize);
                }
            }
        },
        destroy: destroy,
    }
};

return Split;

})));

},{}],2:[function(require,module,exports){
var globalData        = require("./global.js");

var traceColorMap = 
[ 
    // Light Mode, Dark Mode
    ["#C83232B4" , "#C83232B4"],
    ["#CC6600C8" , "#CC6600C8"],
    ["#CC9900C8" , "#CC9900C8"],
    ["#336600C8" , "#336600C8"],
    ["#666633C8" , "#666633C8"],
    ["#FFCC33C8" , "#FFCC33C8"],
    ["#669900C8" , "#669900C8"],
    ["#999966C8" , "#999966C8"],
    ["#99CC99C8" , "#99CC99C8"],
    ["#669999C8" , "#669999C8"],
    ["#33CC99C8" , "#33CC99C8"],
    ["#669966C8" , "#669966C8"],
    ["#336666C8" , "#336666C8"],
    ["#009966C8" , "#009966C8"],
    ["#006699C8" , "#006699C8"],
    ["#3232C8B4" , "#traceLayerB4"],
];
//                         Light Mode, Dark Mode
var padColor_Default     = ["#878787", "#878787"]   ;
var padColor_Pin1        = ["#ffb629", "#ffb629"]   ;
var padColor_IsHighlited = ["#D04040", "#D04040"]   ;
var padColor_IsPlaced    = ["#40D040", "#40D040"];

//                               Light Mode, Dark Mode
var boundingBoxColor_Default   = ["#878787", "#878787"];
var boundingBoxColor_Placed    = ["#40D040", "#40D040"];
var boundingBoxColor_Highlited = ["#D04040", "#D04040"];
var boundingBoxColor_Debug     = ["#2977ff", "#2977ff"];



var drillColor    = ["#CCCCCC", "#CCCCCC"];
var viaColor      = ["#000000", "#000000"];

//                 Light Mode, Dark Mode
var pcbEdgeColor = ["#000000FF","#FFFFFFFF"];


/*
    Currently 2 supported color palette. 
    Palette 0 is for light mode, and palette 1 
    id for dark mode.
*/
function GetColorPalette()
{
    return (globalData.readStorage("darkmode") === "true") ? 1 : 0;
}

function GetTraceColor(traceLayer)
{
    if(traceLayer > 15)
    {
        console.log("ERROR: Trace layer out of range. Using default color.")
        return "#000000";
    }
    else
    {
        return traceColorMap[traceLayer][GetColorPalette()];
    }
    
}



function GetBoundingBoxColor(isHighlited, isPlaced)
{
    let result = boundingBoxColor_Default;

    // Order of color selection.
    if (isPlaced) 
    {
        result     = boundingBoxColor_Placed[GetColorPalette()];
    }
    // Highlighted and not placed
    else if(isHighlited)
    {
        result     = boundingBoxColor_Highlited[GetColorPalette()];
    }
    /* 
        If debug mode is enabled then force drawing a bounding box
      not highlighted,  not placed, and debug mode active
    */
    else if(globalData.getDebugMode())
    {
        result = boundingBoxColor_Debug[GetColorPalette()];
    }
    else
    {
        result = boundingBoxColor_Default[GetColorPalette()];
    }
    return result;
}


function GetPadColor(isPin1, isHighlited, isPlaced)
{
    let result = padColor_Default;

    if(isPin1)
    {
        result = padColor_Pin1[GetColorPalette()];
    }
    else if(isPlaced && isHighlited)
    {
        result = padColor_IsPlaced[GetColorPalette()];
    }
    else if(isHighlited)
    {
        result = padColor_IsHighlited[GetColorPalette()];
    }
    else
    {
        result = padColor_Default[GetColorPalette()];
    }
    return result;
}

function GetPCBEdgeColor()
{
    return pcbEdgeColor[GetColorPalette()];
}

function GetViaColor()
{
    return viaColor[GetColorPalette()];
}

function GetDrillColor()
{
    return drillColor[GetColorPalette()];
}

module.exports = {
    GetTraceColor, GetBoundingBoxColor, GetPadColor, GetPCBEdgeColor,
    GetViaColor, GetDrillColor
};

},{"./global.js":4}],3:[function(require,module,exports){
/*
    Functions for enabling or disabling full screen mode.

    Functions are taken from W3 School,

    https://www.w3schools.com/howto/howto_js_fullscreen.asp
*/
"use strict";


/* View in fullscreen */
function openFullscreen()
{
    let elem = document.documentElement;

    if (elem.requestFullscreen)
    {
        elem.requestFullscreen();
    }
    /* Safari */
    else if (elem.webkitRequestFullscreen)
    {
        elem.webkitRequestFullscreen();
    }
    /* IE11 */
    else if (elem.msRequestFullscreen)
    {
        elem.msRequestFullscreen();
    }
}

/* Close fullscreen */
function closeFullscreen()
{
    if (document.exitFullscreen)
    {
        document.exitFullscreen();
    }
    /* Safari */
    else if (document.webkitExitFullscreen)
    {
        document.webkitExitFullscreen();
    }
    /* IE11 */
    else if (document.msExitFullscreen)
    {
        document.msExitFullscreen();
    }
}

module.exports = {
  openFullscreen, closeFullscreen
};

},{}],4:[function(require,module,exports){
"use strict";

/*************************************************
              Board Rotation                    
*************************************************/
let storage = undefined;
const storagePrefix = "INTERACTIVE_PCB__" + pcbdata.metadata.title + "__" + pcbdata.metadata.revision + "__"

function initStorage ()
{
    try
    {
        window.localStorage.getItem("blank");
        storage = window.localStorage;
    }
    catch (e)
    {
        console.log("ERROR: Storage init error");
    }

    if (!storage)
    {
        try
        {
            window.sessionStorage.getItem("blank");
            storage = window.sessionStorage;
        }
        catch (e)
        {
            console.log("ERROR: Session storage not available");
            // sessionStorage also not available
        }
    }
}

function readStorage(key)
{
    if (storage)
    {
        return storage.getItem(storagePrefix + "#" + key);
    }
    else
    {
        return null;
    }
}

function writeStorage(key, value)
{
    if (storage)
    {
        storage.setItem(storagePrefix + "#" + key, value);
    }
}

/************************************************/

/*************************************************
              Highlighted Refs                    
*************************************************/
let highlightedRefs = [];

function setHighlightedRefs(refs)
{
    highlightedRefs = refs.split(",");
}

function getHighlightedRefs()
{
    return highlightedRefs;
}
/************************************************/

/*************************************************
              Redraw On Drag                      
*************************************************/
let redrawOnDrag = true;

function setRedrawOnDrag(value)
{
    redrawOnDrag = value;
    writeStorage("redrawOnDrag", value);
}

function getRedrawOnDrag()
{
    return redrawOnDrag;
}

/************************************************/


/*************************************************
                 Debug Mode                       
*************************************************/
let debugMode = false;

function setDebugMode(value)
{
    debugMode = value;
    writeStorage("debugMode", value);
}

function getDebugMode()
{
    return debugMode;
}

/************************************************/

/*************************************************
layer Split
*************************************************/
let layersplit;

function setLayerSplit(value)
{
    layersplit = value;
}

function getLayerSplit()
{
    return layersplit;
}

function destroyLayerSplit()
{
    if(layersplit !== null)
    {
        layersplit.destroy();
    }
}

/*************************************************
BOM Split
*************************************************/
let bomsplit;

function setBomSplit(value)
{
    bomsplit = value;
}

function getBomSplit()
{
    return bomsplit;
}

function destroyBomSplit()
{
    bomsplit.destroy();
}

/************************************************/

/*************************************************
Canvas Split
*************************************************/
let canvassplit;

function setCanvasSplit(value)
{
    canvassplit = value;
}

function getCanvasSplit()
{
    return canvassplit;
}

function destroyCanvasSplit()
{
    canvassplit.destroy();
}

function collapseCanvasSplit(value)
{
    canvassplit.collapse(value);
}

function setSizesCanvasSplit()
{
    canvassplit.setSizes([50, 50]);
}

/************************************************/

/*************************************************
Canvas Layout
*************************************************/
let canvaslayout = "FB";

/*XXX Found a bug at startup. Code assumes that canvas layout 
is in one of three states. then system fails. he bug was that the 
canvasLayout was being set to 'default' which is not a valid state. 
So no is check that if default is sent in then set the layout to FB mode.
*/
/* TODO: Make the default check below actually check that the item 
is in one of the three valid states. If not then set to FB, otherwise set to one of
the three valid states
*/
function setCanvasLayout(value)
{
    if(value == "default")
    {
        canvaslayout = "FB";
    }
    else
    {
        canvaslayout = value;
    }
}

function getCanvasLayout()
{
    return canvaslayout;
}

/************************************************/

/*************************************************
BOM Layout
*************************************************/
let bomlayout = "default";

function setBomLayout(value)
{
    bomlayout = value;
}

function getBomLayout()
{
    return bomlayout;
}

/************************************************/

/*************************************************
BOM Sort Function
*************************************************/
let bomSortFunction = null;

function setBomSortFunction(value)
{
    bomSortFunction = value;
}

function getBomSortFunction()
{
    return bomSortFunction;
}

/************************************************/

/*************************************************
Current Sort Column
*************************************************/
let currentSortColumn = null;

function setCurrentSortColumn(value)
{
    currentSortColumn = value;
}

function getCurrentSortColumn()
{
    return currentSortColumn;
}

/************************************************/

/*************************************************
Current Sort Order
*************************************************/
let currentSortOrder = null;

function setCurrentSortOrder(value)
{
    currentSortOrder = value;
}

function getCurrentSortOrder()
{
    return currentSortOrder;
}

/************************************************/

/*************************************************
Current Highlighted Row ID
*************************************************/
let currentHighlightedRowId;

function setCurrentHighlightedRowId(value)
{
    currentHighlightedRowId = value;
}

function getCurrentHighlightedRowId()
{
    return currentHighlightedRowId;
}

/************************************************/

/*************************************************
Highlight Handlers
*************************************************/
let highlightHandlers = [];

function setHighlightHandlers(values)
{
    highlightHandlers = values;
}

function getHighlightHandlers(){
    return highlightHandlers;
}

function pushHighlightHandlers(value)
{
    highlightHandlers.push(value);
}

/************************************************/

/*************************************************
Checkboxes
*************************************************/
let checkboxes = [];

function setCheckboxes(values)
{
    checkboxes = values;
}

function getCheckboxes()
{
    return checkboxes;
}

/************************************************/

/*************************************************
BOM Checkboxes
*************************************************/
let bomCheckboxes = "";

function setBomCheckboxes(values)
{
    bomCheckboxes = values;
}

function getBomCheckboxes()
{
    return bomCheckboxes;
}
/************************************************/

/*************************************************
Remove BOM Entries
*************************************************/
let removeBOMEntries = "";

function setRemoveBOMEntries(values)
{
    removeBOMEntries = values;
}

function getRemoveBOMEntries()
{
    return removeBOMEntries;
}
/************************************************/


/*************************************************
Remove BOM Entries
*************************************************/
let additionalAttributes = "";

function setAdditionalAttributes(values)
{
    additionalAttributes = values;
}

function getAdditionalAttributes(){
    return additionalAttributes;
}
/************************************************/


/*************************************************
Highlight Pin 1
*************************************************/
let highlightpin1 = false;

function setHighlightPin1(value)
{
    writeStorage("highlightpin1", value);
    highlightpin1 = value;
}

function getHighlightPin1(){
    return highlightpin1;
}

/************************************************/

/*************************************************
Last Clicked Ref
*************************************************/
let lastClickedRef;

function setLastClickedRef(value)
{
    lastClickedRef = value;
}

function getLastClickedRef()
{
    return lastClickedRef;
}

/************************************************/


/*************************************************
Combine Values
*************************************************/
let combineValues = false;

function setCombineValues(value)
{
    writeStorage("combineValues", value);
    combineValues = value;
}

function getCombineValues()
{
    return combineValues;
}
/************************************************/



/*************************************************
Combine Values
*************************************************/
let hidePlacedParts = false;

function setHidePlacedParts(value)
{
    writeStorage("hidePlacedParts", value);
    hidePlacedParts = value;
}

function getHidePlacedParts()
{
    return hidePlacedParts;
}
/************************************************/

let allcanvas =  undefined;

function SetAllCanvas(value)
{
    allcanvas = value;
}

function GetAllCanvas()
{
    return allcanvas;
}


let boardRotation = 0;
function SetBoardRotation(value)
{
    boardRotation = value;
}

function GetBoardRotation()
{
    return boardRotation;
}


module.exports = {
    initStorage                , readStorage                , writeStorage          ,
    setHighlightedRefs         , getHighlightedRefs         ,
    setRedrawOnDrag            , getRedrawOnDrag            ,
    setDebugMode               , getDebugMode               ,
    setBomSplit                , getBomSplit                , destroyBomSplit       ,
    setLayerSplit              , getLayerSplit              , destroyLayerSplit     ,
    setCanvasSplit             , getCanvasSplit             , destroyCanvasSplit    , collapseCanvasSplit , setSizesCanvasSplit ,
    setCanvasLayout            , getCanvasLayout            ,
    setBomLayout               , getBomLayout               ,
    setBomSortFunction         , getBomSortFunction         ,
    setCurrentSortColumn       , getCurrentSortColumn       ,
    setCurrentSortOrder        , getCurrentSortOrder        ,
    setCurrentHighlightedRowId , getCurrentHighlightedRowId ,
    setHighlightHandlers       , getHighlightHandlers       , pushHighlightHandlers ,
    setCheckboxes              , getCheckboxes              ,
    setBomCheckboxes           , getBomCheckboxes           ,
    setRemoveBOMEntries        , getRemoveBOMEntries        ,
    setAdditionalAttributes    , getAdditionalAttributes    ,
    setHighlightPin1           , getHighlightPin1           ,
    setLastClickedRef          , getLastClickedRef          ,
    setCombineValues           , getCombineValues           ,
    setHidePlacedParts         , getHidePlacedParts         ,
    SetAllCanvas               , GetAllCanvas               ,
    SetBoardRotation           , GetBoardRotation

};
},{}],5:[function(require,module,exports){
var globalData = require("./global.js");
var render     = require("./render.js");

function handleMouseDown(e, layerdict) 
{
    if (e.which != 1) 
    {
        return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    layerdict.transform.mousestartx = e.offsetX;
    layerdict.transform.mousestarty = e.offsetY;
    layerdict.transform.mousedownx = e.offsetX;
    layerdict.transform.mousedowny = e.offsetY;
    layerdict.transform.mousedown = true;
}

function smoothScrollToRow(rowid) 
{
    document.getElementById(rowid).scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
    });
}

function modulesClicked(references) 
{
    let lastClickedIndex = references.indexOf(globalData.getLastClickedRef());
    let ref = references[(lastClickedIndex + 1) % references.length];
    for (let handler of globalData.getHighlightHandlers()) 
    {
        if (handler.refs.indexOf(ref) >= 0) 
        {
            globalData.setLastClickedRef(ref);
            handler.handler();
            smoothScrollToRow(globalData.getCurrentHighlightedRowId());
            break;
        }
    }
}
function bboxScan(layer, x, y) 
{
    let result = [];
    for (let part of pcbdata.parts) 
    {
        if( part.location == layer)
        {
            let b = part.package.bounding_box;
            if (    (x > b.x0 )
                        && (x < b.x1 )
                        && (y > b.y0 )
                        && (y < b.y1 )
            )
            {
                result.push(part.name);
            }
        }
    }
    return result;
}


function handleMouseClick(e, layerdict) 
{
    let x = e.offsetX;
    let y = e.offsetY;
    let t = layerdict.transform;
    if (layerdict.layer != "B") 
    {
        x = (2 * x / t.zoom - t.panx + t.x) / -t.s;
    } 
    else 
    {
        x = (2 * x / t.zoom - t.panx - t.x) / t.s;
    }
    y = (2 * y / t.zoom - t.y - t.pany) / t.s;
    let v = render.RotateVector([x, y], -globalData.GetBoardRotation());
    let reflist = bboxScan(layerdict.layer, v[0], v[1], t);
    if (reflist.length > 0) 
    {
        modulesClicked(reflist);
        render.drawHighlights();
    }
}

function handleMouseUp(e, layerdict) 
{
    e.preventDefault();
    e.stopPropagation();
    if (    e.which == 1
         && layerdict.transform.mousedown
         && layerdict.transform.mousedownx == e.offsetX
         && layerdict.transform.mousedowny == e.offsetY
    ) 
    {
        // This is just a click
        handleMouseClick(e, layerdict);
        layerdict.transform.mousedown = false;
        return;
    }
    if (e.which == 3) 
    {
        // Reset pan and zoom on right click.
        layerdict.transform.panx = 0;
        layerdict.transform.pany = 0;
        layerdict.transform.zoom = 1;
        render.drawCanvas(layerdict);
    } 
    else if (!globalData.getRedrawOnDrag()) 
    {
        render.drawCanvas(layerdict);
    }
    layerdict.transform.mousedown = false;
}

function handleMouseMove(e, layerdict) 
{
    if (!layerdict.transform.mousedown) 
    {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    let dx = e.offsetX - layerdict.transform.mousestartx;
    let dy = e.offsetY - layerdict.transform.mousestarty;
    layerdict.transform.panx += 2 * dx / layerdict.transform.zoom;
    layerdict.transform.pany += 2 * dy / layerdict.transform.zoom;
    layerdict.transform.mousestartx = e.offsetX;
    layerdict.transform.mousestarty = e.offsetY;
    
    if (globalData.getRedrawOnDrag()) 
    {
        render.drawCanvas(layerdict);
    }
}

function handleMouseWheel(e, layerdict) 
{
    e.preventDefault();
    e.stopPropagation();
    var t = layerdict.transform;
    var wheeldelta = e.deltaY;
    if (e.deltaMode == 1) 
    {
        // FF only, scroll by lines
        wheeldelta *= 30;
    } 
    else if (e.deltaMode == 2) 
    {
        wheeldelta *= 300;
    }
    
    var m = Math.pow(1.1, -wheeldelta / 40);
    // Limit amount of zoom per tick.
    if (m > 2) 
    {
        m = 2;
    } 
    else if (m < 0.5) 
    {
        m = 0.5;
    }
    
    t.zoom *= m;
    var zoomd = (1 - m) / t.zoom;
    t.panx += 2 * e.offsetX * zoomd;
    t.pany += 2 * e.offsetY * zoomd;
    render.drawCanvas(layerdict);
    render.drawHighlights();
}

function addMouseHandlers(div, layerdict) 
{
    div.onmouseclick = function(e)
    {
        handleMouseClick(e, layerdict);
    };

    div.onmousedown = function(e) 
    {
        handleMouseDown(e, layerdict);
    };
    
    div.onmousemove = function(e) 
    {
        handleMouseMove(e, layerdict);
    };
    
    div.onmouseup = function(e) 
    {
        handleMouseUp(e, layerdict);
    };
    
    // TODO: Needed if wanting mouse move over part in bom and not click behavior
    //div.onmouseout = function(e) 
    //{
    //    handleMouseUp(e, layerdict);
    //};

    div.onwheel = function(e) 
    {
        handleMouseWheel(e, layerdict);
    };
    
    
    for (var element of [div]) 
    {
        element.addEventListener("contextmenu", function(e) 
        {
            e.preventDefault();
        }, false);
    }
}

module.exports = {
    addMouseHandlers
};

},{"./global.js":4,"./render.js":9}],6:[function(require,module,exports){
var globalData = require("./global.js");
var render     = require("./render.js");
var ipcb       = require("./ipcb.js");

const boardRotation = document.getElementById("boardRotation");
boardRotation.oninput=function()
{
    render.SetBoardRotation(boardRotation.value);
};

const darkModeBox = document.getElementById("darkmodeCheckbox");
darkModeBox.onchange = function () 
{
    ipcb.setDarkMode(darkModeBox.checked);
};

const silkscreenCheckbox = document.getElementById("silkscreenCheckbox");
silkscreenCheckbox.checked=function()
{
    ipcb.silkscreenVisible(silkscreenCheckbox.checked);
};

silkscreenCheckbox.onchange=function()
{
    ipcb.silkscreenVisible(silkscreenCheckbox.checked);
};

const highlightpin1Checkbox =document.getElementById("highlightpin1Checkbox");
highlightpin1Checkbox.onchange=function()
{
    globalData.setHighlightPin1(highlightpin1Checkbox.checked);
    render.drawCanvas(globalData.GetAllCanvas().front);
    render.drawCanvas(globalData.GetAllCanvas().back);
};

const dragCheckbox = document.getElementById("dragCheckbox");
dragCheckbox.checked=function()
{
    globalData.setRedrawOnDrag(dragCheckbox.checked);
};
dragCheckbox.onchange=function()
{
    globalData.setRedrawOnDrag(dragCheckbox.checked);
};


const combineValues = document.getElementById("combineValues");
combineValues.onchange=function()
{
    globalData.setCombineValues(combineValues.checked);
    ipcb.populateBomTable();
};


const hidePlacedParts = document.getElementById("hidePlacedParts");
hidePlacedParts.onchange=function()
{
    globalData.setHidePlacedParts(hidePlacedParts.checked);
    ipcb.populateBomTable();
};

const debugModeBox = document.getElementById("debugMode");
debugModeBox.onchange=function()
{
    globalData.setDebugMode(debugModeBox.checked);
    render.drawCanvas(globalData.GetAllCanvas().front);
    render.drawCanvas(globalData.GetAllCanvas().back);
};




const filterBOM = document.getElementById("bom-filter");
filterBOM.oninput=function()
{
    ipcb.setFilterBOM(filterBOM.value);
};

const clearFilterBOM = document.getElementById("clearBOMSearch");
clearFilterBOM.onclick=function()
{
    filterBOM.value="";
    ipcb.setFilterBOM(filterBOM.value);
};

const filterLayer = document.getElementById("layer-filter");
filterLayer.oninput=function()
{
    ipcb.setFilterLayer(filterLayer.value);
};

const clearFilterLayer = document.getElementById("clearLayerSearch");
clearFilterLayer.onclick=function()
{
    filterLayer.value="";
    ipcb.setFilterLayer(filterLayer.value);
};

const bomCheckboxes = document.getElementById("bomCheckboxes");
bomCheckboxes.oninput=function()
{
    ipcb.setBomCheckboxes(bomCheckboxes.value);
};

const removeBOMEntries = document.getElementById("removeBOMEntries");
removeBOMEntries.oninput=function()
{
    ipcb.setRemoveBOMEntries(removeBOMEntries.value);
};

const additionalAttributes = document.getElementById("additionalAttributes");
additionalAttributes.oninput=function()
{
    ipcb.setAdditionalAttributes(additionalAttributes.value);
};

const fl_btn = document.getElementById("fl-btn");
fl_btn.onclick=function()
{
    ipcb.changeCanvasLayout("F");
};

const fb_btn = document.getElementById("fb-btn");
fb_btn.onclick=function()
{
    ipcb.changeCanvasLayout("FB");
};

const bl_btn = document.getElementById("bl-btn");
bl_btn.onclick=function()
{
    ipcb.changeCanvasLayout("B");
};

const bom_btn = document.getElementById("bom-btn");
bom_btn.onclick=function()
{
    ipcb.changeBomLayout("BOM");
};

const lr_btn = document.getElementById("bom-lr-btn");
lr_btn.onclick=function()
{
    ipcb.changeBomLayout("LR");
};

const tb_btn = document.getElementById("bom-tb-btn");
tb_btn.onclick=function()
{
    ipcb.changeBomLayout("TB");
};

const pcb_btn = document.getElementById("pcb-btn");
pcb_btn.onclick=function()
{
    ipcb.changeBomLayout("PCB");
};

const lay_btn = document.getElementById("lay-btn");
lay_btn.onclick=function()
{
    ipcb.toggleLayers();
};

const fullscreen_btn = document.getElementById("fullscreen-btn");
fullscreen_btn.onclick=function()
{
    ipcb.toggleFullScreen();
};

},{"./global.js":4,"./ipcb.js":7,"./render.js":9}],7:[function(require,module,exports){
/* DOM manipulation and misc code */

"use strict";
var Split      = require("split.js");
var globalData = require("./global.js");
var render     = require("./render.js");
var pcb        = require("./pcb.js");
var handlers_mouse    = require("./handlers_mouse.js");
var version           = require("./version.js");
var Fullscreen        = require("./fullscreen.js");

//TODO: GLOBAL VARIABLES
let layerBody = undefined;
let layerHead = undefined;
let bomhead   = undefined;
let bom = undefined;
let bomtable = undefined;

//TODO:  GLOBAL VARIABLE REFACTOR
let filterBOM = "";
function getFilterBOM() 
{
    return filterBOM;
}

function setFilterBOM(input) 
{
    filterBOM = input.toLowerCase();
    populateBomTable();
}


let filterLayer = "";
function getFilterLayer() 
{
    return filterLayer;
}

function setFilterLayer(input) 
{
    filterLayer = input.toLowerCase();
    populateLayerTable();
}

function setDarkMode(value)
{
    if (value)
    {
        let topmostdiv = document.getElementById("topmostdiv");
        topmostdiv.classList.add("dark");
    }
    else
    {
        let topmostdiv = document.getElementById("topmostdiv");
        topmostdiv.classList.remove("dark");
    }
    globalData.writeStorage("darkmode", value);
    render.drawCanvas(globalData.GetAllCanvas().front);
    render.drawCanvas(globalData.GetAllCanvas().back);
}

function createCheckboxChangeHandler(checkbox, bomentry)
{
    return function() 
    {
        if(bomentry.checkboxes.get(checkbox))
        {
            bomentry.checkboxes.set(checkbox,false);
            globalData.writeStorage("checkbox" + "_" + checkbox.toLowerCase() + "_" + bomentry.reference, "false");
        }
        else
        {
            bomentry.checkboxes.set(checkbox,true);
            globalData.writeStorage("checkbox" + "_" + checkbox.toLowerCase() + "_" + bomentry.reference, "true");
        }
        // Save currently highlited row
        let rowid = globalData.getCurrentHighlightedRowId();
        // Redraw the canvas
        render.drawCanvas(globalData.GetAllCanvas().front);
        render.drawCanvas(globalData.GetAllCanvas().back);
        // Redraw the BOM table
        populateBomTable();
        // Render current row so its highlighted
        document.getElementById(rowid).classList.add("highlighted");
        // Set current selected row global variable
        globalData.setCurrentHighlightedRowId(rowid);
        // If highlighted then a special color will be used for the part.
        render.drawHighlights(IsCheckboxClicked(globalData.getCurrentHighlightedRowId(), "placed"));
    };
}

function createRowHighlightHandler(rowid, refs)
{
    return function()
    {
        if (globalData.getCurrentHighlightedRowId())
        {
            if (globalData.getCurrentHighlightedRowId() == rowid)
            {
                return;
            }
            document.getElementById(globalData.getCurrentHighlightedRowId()).classList.remove("highlighted");
        }

        document.getElementById(rowid).classList.add("highlighted");
        globalData.setCurrentHighlightedRowId(rowid);
        globalData.setHighlightedRefs(refs);
        // If highlighted then a special color will be used for the part.
        render.drawHighlights(IsCheckboxClicked(globalData.getCurrentHighlightedRowId(), "placed"));
    }
}

function entryMatches(part)
{
    // check refs
    if (part.reference.toLowerCase().indexOf(getFilterBOM()) >= 0)
    {
        return true;
    }
    // check value
    if (part.value.toLowerCase().indexOf(getFilterBOM())>= 0)
    {
        return true;
    } 

    // Check the displayed attributes
    let additionalAttributes = globalData.getAdditionalAttributes().split(",");
    additionalAttributes     = additionalAttributes.filter(function(e){return e;});
    for (let x of additionalAttributes)
    {
        // remove beginning and trailing whitespace
        x = x.trim();
        if (part.attributes.has(x))
        {
            if(part.attributes.get(x).indexOf(getFilterBOM()) >= 0)
            {
                return true;
            }
        }
    }

    return false;
}

function entryMatchesLayer(layer) 
{
    // check refs
    if (layer.name.toLowerCase().indexOf(getFilterLayer()) >= 0) 
    {
        return true;
    }
    return false;
}
function highlightFilterLayer(s) 
{
    if (!getFilterLayer()) 
    {
        return s;
    }
    let parts = s.toLowerCase().split(getFilterLayer());
    if (parts.length == 1) 
    {
        return s;
    }
    let r = "";
    let pos = 0;
    for (let i in parts) 
    {
        if (i > 0) 
        {
            r += "<mark class=\"highlight\">" + s.substring(pos, pos + getFilterLayer().length) + "</mark>";
            pos += getFilterLayer().length;
        }
        r += s.substring(pos, pos + parts[i].length);
        pos += parts[i].length;
    }
    return r;
}


function highlightFilter(s)
{
    if (!getFilterBOM()) 
    {
        return s;
    }
    let parts = s.toLowerCase().split(getFilterBOM());
    if (parts.length == 1)
    {
        return s;
    }

    let r = "";
    let pos = 0;
    for (let i in parts)
    {
        if (i > 0)
        {
            r += "<mark class=\"highlight\">" + s.substring(pos, pos + getFilterBOM().length) + "</mark>";
            pos += getFilterBOM().length;
        }
        r += s.substring(pos, pos + parts[i].length);
        pos += parts[i].length;
    }
    return r;
}

function createColumnHeader(name, cls, comparator)
{
    let th = document.createElement("TH");
    th.innerHTML = name;
    th.classList.add(cls);
    th.style.cursor = "pointer";
    let span = document.createElement("SPAN");
    span.classList.add("sortmark");
    span.classList.add("none");
    th.appendChild(span);
    th.onclick = function()
    {
        if (globalData.getCurrentSortColumn() && this !== globalData.getCurrentSortColumn()) 
        {
            // Currently sorted by another column
            globalData.getCurrentSortColumn().childNodes[1].classList.remove(globalData.getCurrentSortOrder());
            globalData.getCurrentSortColumn().childNodes[1].classList.add("none");
            globalData.setCurrentSortColumn(null);
            globalData.setCurrentSortOrder(null);
        }

        if (globalData.getCurrentSortColumn() && this === globalData.getCurrentSortColumn()) 
        {
            // Already sorted by this column
            if (globalData.getCurrentSortOrder() == "asc") 
            {
                // Sort by this column, descending order
                globalData.setBomSortFunction(function(a, b) 
                {
                    return -comparator(a, b);
                });
                globalData.getCurrentSortColumn().childNodes[1].classList.remove("asc");
                globalData.getCurrentSortColumn().childNodes[1].classList.add("desc");
                globalData.setCurrentSortOrder("desc");
            } 
            else 
            {
                // Unsort
                globalData.setBomSortFunction(null);
                globalData.getCurrentSortColumn().childNodes[1].classList.remove("desc");
                globalData.getCurrentSortColumn().childNodes[1].classList.add("none");
                globalData.setCurrentSortColumn(null);
                globalData.setCurrentSortOrder(null);
            }
        }
        else
        {
            // Sort by this column, ascending order
            globalData.setBomSortFunction(comparator);
            globalData.setCurrentSortColumn(this);
            globalData.getCurrentSortColumn().childNodes[1].classList.remove("none");
            globalData.getCurrentSortColumn().childNodes[1].classList.add("asc");
            globalData.setCurrentSortOrder("asc");
        }
        populateBomBody();
    }
    return th;
}

// Describes how to sort checkboxes
function CheckboxCompare(stringName)
{
    return (partA, partB) => {
        if (partA.checkboxes.get(stringName) && !partB.checkboxes.get(stringName)) 
        {
            return  1;
        }
        else if (!partA.checkboxes.get(stringName) && partB.checkboxes.get(stringName)) 
        {
            return -1;
        } 
        else
        {
            return 0;
        }
    }
}

// Describes hoe to sort by attributes
function AttributeCompare(stringName)
{
    return (partA, partB) => {
        if (partA.attributes.get(stringName) != partB.attributes.get(stringName))
        {
            return  partA.attributes.get(stringName) > partB.attributes.get(stringName) ? 1 : -1;
        }
        else
        {
            return 0;
        }
    }
}

function populateLayerHeader()
{
    while (layerHead.firstChild) 
    {
        layerHead.removeChild(layerHead.firstChild);
    }

    // Header row
    let tr = document.createElement("TR");
    // Defines the
    let th = document.createElement("TH");

    th.classList.add("visiableCol");

    let tr2 = document.createElement("TR");
    let thf = document.createElement("TH");
    let thb = document.createElement("TH");

    thf.innerHTML = "Front"
    thb.innerHTML = "Back"
    tr2.appendChild(thf)
    tr2.appendChild(thb)

    th.innerHTML = "Visible";
    th.colSpan = 2
    let span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    th = document.createElement("TH");
    th.innerHTML = "Layer";
    th.rowSpan = 2;
    span = document.createElement("SPAN");
    span.classList.add("none");
    th.appendChild(span);
    tr.appendChild(th);

    layerHead.appendChild(tr);
    layerHead.appendChild(tr2);
}

function createLayerCheckboxChangeHandler(layerEntry, isFront) {
    return function() 
    {
        if(isFront)
        {
            if(layerEntry.visible_front)
            {
                pcb.SetLayerVisibility(layerEntry.name, isFront, false);
                globalData.writeStorage("checkbox_layer_front_" + layerEntry.name + "_visible", "false");
            }
            else
            {
                pcb.SetLayerVisibility(layerEntry.name, isFront, true);
                globalData.writeStorage("checkbox_layer_front_" + layerEntry.name + "_visible", "true");
            }
        }
        else
        {
            if(layerEntry.visible_back)
            {
                pcb.SetLayerVisibility(layerEntry.name, isFront, false);
                globalData.writeStorage("checkbox_layer_back_" + layerEntry.name + "_visible", "false");
            }
            else
            {
                pcb.SetLayerVisibility(layerEntry.name, isFront, true);
                globalData.writeStorage("checkbox_layer_back_" + layerEntry.name + "_visible", "true");
            }
        }
    }
}


function populateLayerBody() 
{
    while (layerBody.firstChild) 
    {
        layerBody.removeChild(layerBody.firstChild);
    }
    let layertable =  pcb.GetLayers();

    // remove entries that do not match filter
    for (let i of layertable) 
    {

        if (getFilterLayer() != "")
        {
            if(!entryMatchesLayer(i))
            {
                continue;
            }
        }

        let tr = document.createElement("TR");
        let td = document.createElement("TD");
        let input_front = document.createElement("input");
        let input_back = document.createElement("input");
        input_front.type = "checkbox";
        input_back.type = "checkbox";
        // Assumes that all layers are visible by default.
        if (    (globalData.readStorage( "checkbox_layer_front_" + i.name + "_visible" ) == "true")
             || (globalData.readStorage( "checkbox_layer_front_" + i.name + "_visible" ) == null)
        )
        {
            pcb.SetLayerVisibility(i.name, true, true);
            input_front.checked = true;
        }
        else
        {
            pcb.SetLayerVisibility(i.name, true, false);
            input_front.checked = false;
        }


        if (    (globalData.readStorage( "checkbox_layer_back_" + i.name + "_visible" ) == "true")
             || (globalData.readStorage( "checkbox_layer_back_" + i.name + "_visible" ) == null)
        )
        {
            pcb.SetLayerVisibility(i.name, false, true);
            input_back.checked = true;
        }
        else
        {
            pcb.SetLayerVisibility(i.name, false, false);
            input_back.checked = false;
        }

        
        input_front.onchange = createLayerCheckboxChangeHandler(i, true);
        input_back.onchange  = createLayerCheckboxChangeHandler(i, false);
        td.appendChild(input_front);
        tr.appendChild(td);

        td = document.createElement("TD");
        td.appendChild(input_back);
        tr.appendChild(td);

        // Layer
        td = document.createElement("TD");
        td.innerHTML =highlightFilterLayer(i.name);
        tr.appendChild(td);
        
        layerbody.appendChild(tr);
    }
}

function populateBomHeader() 
{
    while (bomhead.firstChild)
    {
        bomhead.removeChild(bomhead.firstChild);
    }
    
    let tr = document.createElement("TR");
    let th = document.createElement("TH");
    th.classList.add("numCol");
    tr.appendChild(th);


    let additionalCheckboxes = globalData.getBomCheckboxes().split(",");
    additionalCheckboxes     = additionalCheckboxes.filter(function(e){return e});
    globalData.setCheckboxes(additionalCheckboxes);
    for (let x2 of additionalCheckboxes)
    {
        // remove beginning and trailing whitespace
        x2 = x2.trim()
        if (x2) 
        {
            tr.appendChild(createColumnHeader(x2, "Checkboxes", CheckboxCompare(x2)));
        }
    }

    tr.appendChild(createColumnHeader("References", "References", (partA, partB) => {
        if (partA.reference != partB.reference)
        {
            return partA.reference > partB.reference ? 1 : -1;
        }
        else
        {
            return 0;
        }
    }));

    tr.appendChild(createColumnHeader("Value", "Value", (partA, partB) => {
        if (partA.value != partB.value)
        {
            return partA.value > partB.value ? 1 : -1;
        }
        else
        {
            return 0;
        }
    }));

    let additionalAttributes = globalData.getAdditionalAttributes().split(",");
    // Remove null, "", undefined, and 0 values
    additionalAttributes    =additionalAttributes.filter(function(e){return e});
    for (let x of additionalAttributes)
    {
        // remove beginning and trailing whitespace
        x = x.trim()
        if (x) 
        {
            tr.appendChild(createColumnHeader(x, "Attributes", AttributeCompare(x)));
        }
    }

    if(globalData.getCombineValues())
    {
            //XXX: This comparison function is using positive and negative implicit
            tr.appendChild(createColumnHeader("Quantity", "Quantity", (partA, partB) => {
            return partA.quantity - partB.quantity;
            }));
    }

    bomhead.appendChild(tr);

}



////////////////////////////////////////////////////////////////////////////////
// Filter functions are defined here. These let the application filter 
// elements out of the complete bom. 
//
// The filtering function should return true if the part should be filtered out
// otherwise it returns false
////////////////////////////////////////////////////////////////////////////////
function GetBOMForSideOfBoard(location)
{
    let result = pcb.GetBOM();
    switch (location)
    {
    case "F":
        result = pcb.filterBOMTable(result, filterBOM_Front);
        break;
    case "B":
        result = pcb.filterBOMTable(result, filterBOM_Back);
        break;
    default:
        break;
    }
    return result;
}

function filterBOM_Front(part)
{
    let result = true;
    if(part.location == "F")
    {
        result = false;
    }
    return result;
}

function filterBOM_Back(part)
{
    let result = true;
    if(part.location == "B")
    {
        result = false;
    }
    return result;
}

function filterBOM_ByAttribute(part)
{
    let result = false;
    let splitFilterString = globalData.getRemoveBOMEntries().split(",");
    // Remove null, "", undefined, and 0 values
    splitFilterString    = splitFilterString.filter(function(e){return e});

    if(splitFilterString.length > 0 )
    {
        for(let i of splitFilterString)
        {
            // removing beginning and trailing whitespace
            i = i.trim()
            for (let value of part.attributes.values())
            {
                // Id the value is an empty string then dont filter out the entry. 
                // if the value is anything then filter out the bom entry
                if(value != "")
                {
                    if(value == i)
                    {
                        result = true;
                    }
                }
            }
        }
    }
    return result;
}
////////////////////////////////////////////////////////////////////////////////

function GenerateBOMTable()
{
    // Get bom table with elements for the side of board the user has selected
    let bomtableTemp = GetBOMForSideOfBoard(globalData.getCanvasLayout());

    // Apply attribute filter to board
    bomtableTemp = pcb.filterBOMTable(bomtableTemp, filterBOM_ByAttribute);

    // If the parts are displayed one per line (not combined values), then the the bom table needs to be flattened. 
    // By default the data in the json file is combined
    bomtable = globalData.getCombineValues() ? pcb.GetBOMCombinedValues(bomtableTemp) : bomtableTemp;

    return bomtable;
}

function populateBomBody()
{
    while (bom.firstChild)
    {
        bom.removeChild(bom.firstChild);
    }

    globalData.setHighlightHandlers([]);
    globalData.setCurrentHighlightedRowId(null);
    let first = true;

    bomtable = GenerateBOMTable();

    if (globalData.getBomSortFunction())
    {
        bomtable = bomtable.slice().sort(globalData.getBomSortFunction());
    }
    for (let i in bomtable)
    {
        let bomentry = bomtable[i];
        let references = bomentry.reference;

        // remove entries that do not match filter
        if (getFilterBOM() != "")
        {
            if(!entryMatches(bomentry))
            {
                continue;
            }
        }

        // Hide placed parts option is set
        if(globalData.getHidePlacedParts())
        {
            // Remove entries that have been placed. Check the placed parameter
            if(globalData.readStorage( "checkbox" + "_" + "placed" + "_" + bomentry.reference ) == "true")
            {
                continue;
            }
        }

        let tr = document.createElement("TR");
        let td = document.createElement("TD");
        let rownum = +i + 1;
        tr.id = "bomrow" + rownum;
        td.textContent = rownum;
        tr.appendChild(td);

        // Checkboxes
        let additionalCheckboxes = globalData.getBomCheckboxes().split(",");
        for (let checkbox of additionalCheckboxes) 
        {
            checkbox = checkbox.trim();
            if (checkbox) 
            {
                td = document.createElement("TD");
                let input = document.createElement("input");
                input.type = "checkbox";
                input.onchange = createCheckboxChangeHandler(checkbox, bomentry);
                // read the value in from local storage

                if(globalData.readStorage( "checkbox" + "_" + checkbox.toLowerCase() + "_" + bomentry.reference ) == "true")
                {
                    bomentry.checkboxes.set(checkbox,true)
                }
                else
                {
                    bomentry.checkboxes.set(checkbox,false)
                }

                if(bomentry.checkboxes.get(checkbox))
                {
                    input.checked = true;
                }
                else
                {
                    input.checked = false;
                }

                td.appendChild(input);
                tr.appendChild(td);
            }
        }



        //INFO: The lines below add the control the columns on the bom table
        // References
        td = document.createElement("TD");
        td.innerHTML = highlightFilter(references);
        tr.appendChild(td);
        // Value
        td = document.createElement("TD");
        td.innerHTML = highlightFilter(bomentry.value);
        tr.appendChild(td);
        
        // Attributes
        let additionalAttributes = globalData.getAdditionalAttributes().split(",");
        for (let x of additionalAttributes)
        {
            x = x.trim()
            if (x)
            {
                td = document.createElement("TD");
                td.innerHTML = highlightFilter(pcb.getAttributeValue(bomentry, x.toLowerCase()));
                tr.appendChild(td);
            }
        }

        if(globalData.getCombineValues())
        {
            td = document.createElement("TD");
            td.textContent = bomentry.quantity;
            tr.appendChild(td);
        }
        bom.appendChild(tr);


        bom.appendChild(tr);
        let handler = createRowHighlightHandler(tr.id, references);
        tr.onclick = handler;
        globalData.pushHighlightHandlers({
            id: tr.id,
            handler: handler,
            refs: references
        });

        if (getFilterBOM() && first)
        {
            handler();
            first = false;
        }
    }
}

function highlightPreviousRow()
{
    if (!globalData.getCurrentHighlightedRowId())
    {
        globalData.getHighlightHandlers()[globalData.getHighlightHandlers().length - 1].handler();
    }
    else
    {
        if (    (globalData.getHighlightHandlers().length > 1)
             && (globalData.getHighlightHandlers()[0].id == globalData.getCurrentHighlightedRowId())
        )
        {
            globalData.getHighlightHandlers()[globalData.getHighlightHandlers().length - 1].handler();
        }
        else
        {
            for (let i = 0; i < globalData.getHighlightHandlers().length - 1; i++)
            {
                if (globalData.getHighlightHandlers()[i + 1].id == globalData.getCurrentHighlightedRowId())
                {
                    globalData.getHighlightHandlers()[i].handler();
                    break;
                }
            }
        }
    }
    render.smoothScrollToRow(globalData.getCurrentHighlightedRowId());
}

function highlightNextRow()
{
    if (!globalData.getCurrentHighlightedRowId())
    {
        globalData.getHighlightHandlers()[0].handler();
    }
    else
    {
        if (    (globalData.getHighlightHandlers().length > 1)
             && (globalData.getHighlightHandlers()[globalData.getHighlightHandlers().length - 1].id == globalData.getCurrentHighlightedRowId())
        )
        {
            globalData.getHighlightHandlers()[0].handler();
        }
        else
        {
            for (let i = 1; i < globalData.getHighlightHandlers().length; i++)
            {
                if (globalData.getHighlightHandlers()[i - 1].id == globalData.getCurrentHighlightedRowId())
                {
                    globalData.getHighlightHandlers()[i].handler();
                    break;
                }
            }
        }
    }
    smoothScrollToRow(globalData.getCurrentHighlightedRowId());
}

function populateLayerTable()
{
    populateLayerHeader();
    populateLayerBody();
}

function populateBomTable()
{
    populateBomHeader();
    populateBomBody();
}

function modulesClicked(references)
{
    let lastClickedIndex = references.indexOf(globalData.getLastClickedRef());
    let ref = references[(lastClickedIndex + 1) % references.length];
    for (let handler of globalData.getHighlightHandlers()) 
    {
        if (handler.refs.indexOf(ref) >= 0)
        {
            globalData.setLastClickedRef(ref);
            handler.handler();
            smoothScrollToRow(globalData.getCurrentHighlightedRowId());
            break;
        }
    }
}

function silkscreenVisible(visible)
{
    if (visible)
    {
        globalData.GetAllCanvas().front.silk.style.display = "";
        globalData.GetAllCanvas().back.silk.style.display = "";
        globalData.writeStorage("silkscreenVisible", true);
    }
    else
    {
        globalData.GetAllCanvas().front.silk.style.display = "none";
        globalData.GetAllCanvas().back.silk.style.display = "none";
        globalData.writeStorage("silkscreenVisible", false);
    }
}

function changeCanvasLayout(layout) 
{
    if(mainLayout != "BOM")
    {
        document.getElementById("fl-btn").classList.remove("depressed");
        document.getElementById("fb-btn").classList.remove("depressed");
        document.getElementById("bl-btn").classList.remove("depressed");

        switch (layout) 
        {
        case "F":
            document.getElementById("fl-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM") 
            {
                globalData.collapseCanvasSplit(1);
            }
            break;
        case "B":
            document.getElementById("bl-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM") 
            {
                globalData.collapseCanvasSplit(0);
            }
            break;
        default:
            document.getElementById("fb-btn").classList.add("depressed");
            if (globalData.getBomLayout() != "BOM") 
            {
                globalData.setSizesCanvasSplit([50, 50]);
            }
            break;
        }

        globalData.setCanvasLayout(layout);
        globalData.writeStorage("canvaslayout", layout);
        render.resizeAll();
    }
}

function populateMetadata()
{
    let metadata  = pcb.GetMetadata();
    if(metadata.revision == undefined)
    {
        document.getElementById("revision").innerHTML = "";
    }
    else
    {
        document.getElementById("revision").innerHTML = "Revision: " + metadata.revision.toString();;
    }

    if(metadata.company == undefined)
    {
        document.getElementById("company").innerHTML = "";
    }
    else
    {
        document.getElementById("company").innerHTML  = metadata.company;
    }

    if(metadata.title == undefined)
    {
         document.getElementById("title").innerHTML = "";
    }
    else
    {
         document.getElementById("title").innerHTML = metadata.title;
    }

    if(metadata.date == undefined)
    {
         document.getElementById("filedate").innerHTML = "";
    }
    else
    {
         document.getElementById("filedate").innerHTML = metadata.date;
    }
}


let layerVisable = true;
let mainLayout = "";
document.getElementById("lay-btn").classList.add("depressed");
function toggleLayers()
{
    if (layerVisable)
    {
        layerVisable = false;
        document.getElementById("lay-btn").classList.remove("depressed");
    }
    else
    {
        layerVisable = true;
        document.getElementById("lay-btn").classList.add("depressed");
    }
    changeBomLayout(mainLayout);
}


function changeBomLayout(layout)
{
    mainLayout = layout;
    document.getElementById("bom-btn").classList.remove("depressed");
    document.getElementById("bom-lr-btn").classList.remove("depressed");
    document.getElementById("bom-tb-btn").classList.remove("depressed");
    document.getElementById("pcb-btn").classList.remove("depressed");
    switch (layout) 
    {
    case "BOM":
        document.getElementById("bom-btn").classList.add("depressed");

        document.getElementById("fl-btn").classList.remove("depressed");
        document.getElementById("fb-btn").classList.remove("depressed");
        document.getElementById("bl-btn").classList.remove("depressed");

        if (globalData.getBomSplit()) 
        {
            if(layerVisable)
            {
                globalData.destroyLayerSplit();
                globalData.setLayerSplit(null);
            }
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "none";
        document.getElementById("backcanvas").style.display = "none";
        if(layerVisable)
        {
            layerVisable = false;
            document.getElementById("lay-btn").classList.remove("depressed");
            document.getElementById("layerdiv").style.display = "none";
        }

        document.getElementById("bot").style.height = "";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        break;
 case "PCB":
    
        document.getElementById("pcb-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "none";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";
        
        if(layerVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }

        document.getElementById("bot"        ).style.height = "calc(90%)";
        
        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.remove(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.remove(   "split-horizontal");
        document.getElementById("frontcanvas").classList.add(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.add(   "split-horizontal");
        if(layerVisable)
        {
            document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");
        }

        if (globalData.getBomSplit())
        {
            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(layerVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }
        else
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [99, 0.1],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }

        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            direction: "vertical",
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));

        document.getElementById("canvasdiv"  ).style.height = "calc(99%)";
        
        break;
    case "TB":
        document.getElementById("bom-tb-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";
        if(layerVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }
        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"   ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.remove(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.remove(   "split-horizontal");
        document.getElementById("frontcanvas").classList.add(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.add(   "split-horizontal");
        if(layerVisable)
        {
            document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");
        }

        if (globalData.getBomSplit())
        {
            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);
            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(layerVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }
        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            direction: "vertical",
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));

        
        break;
    case "LR":
        document.getElementById("bom-lr-btn"     ).classList.add("depressed");
        document.getElementById("bomdiv").style.display = "";
        document.getElementById("frontcanvas").style.display = "";
        document.getElementById("backcanvas" ).style.display = "";
        if(layerVisable)
        {
            document.getElementById("layerdiv"   ).style.display = "";
        }
        else
        {
            document.getElementById("layerdiv"   ).style.display = "none";
        }
        document.getElementById("bot"        ).style.height = "calc(90%)";

        document.getElementById("datadiv"    ).classList.add(   "split-horizontal");
        document.getElementById("bomdiv"     ).classList.add(   "split-horizontal");
        document.getElementById("canvasdiv"  ).classList.add(   "split-horizontal");
        document.getElementById("frontcanvas").classList.remove(   "split-horizontal");
        document.getElementById("backcanvas" ).classList.remove(   "split-horizontal");
        document.getElementById("layerdiv"   ).classList.add(   "split-horizontal");

        if (globalData.getBomSplit())
        {

            globalData.destroyLayerSplit();
            globalData.setLayerSplit(null);

            globalData.destroyBomSplit();
            globalData.setBomSplit(null);
            globalData.destroyCanvasSplit();
            globalData.setCanvasSplit(null);
        }

        if(layerVisable)
        {
            globalData.setLayerSplit(Split(["#datadiv", "#layerdiv"], {
                sizes: [80, 20],
                onDragEnd: render.resizeAll,
                gutterSize: 5,
                cursor: "col-resize"
            }));
        }

        globalData.setBomSplit(Split(["#bomdiv", "#canvasdiv"], {
            sizes: [50, 50],
            onDragEnd: render.resizeAll,
            gutterSize: 5,
            cursor: "row-resize"
        }));

        globalData.setCanvasSplit(Split(["#frontcanvas", "#backcanvas"], {
            sizes: [50, 50],
            direction: "vertical",
            gutterSize: 5,
            onDragEnd: render.resizeAll,
            cursor: "row-resize"
        }));
        
        break;
    }
    globalData.setBomLayout(layout);
    globalData.writeStorage("bomlayout", layout);
    populateBomTable();
    changeCanvasLayout(globalData.getCanvasLayout());
}

function focusInputField(input)
{
    input.scrollIntoView(false);
    input.focus();
    input.select();
}

function focusBOMFilterField()
{
    focusInputField(document.getElementById("bom-filter"));
}

function toggleBomCheckbox(bomrowid, checkboxnum)
{
    if (!bomrowid || checkboxnum > globalData.getCheckboxes().length)
    {
        return;
    }
    let bomrow = document.getElementById(bomrowid);
    let checkbox = bomrow.childNodes[checkboxnum].childNodes[0];
    checkbox.checked = !checkbox.checked;
    checkbox.indeterminate = false;
    checkbox.onchange();
}

function IsCheckboxClicked(bomrowid, checkboxname) 
{
    let checkboxnum = 0;
    while (checkboxnum < globalData.getCheckboxes().length && globalData.getCheckboxes()[checkboxnum].toLowerCase() != checkboxname.toLowerCase()) 
    {
        checkboxnum++;
    }
    if (!bomrowid || checkboxnum >= globalData.getCheckboxes().length) 
    {
        return;
    }
    let bomrow = document.getElementById(bomrowid);
    let checkbox = bomrow.childNodes[checkboxnum + 1].childNodes[0];
    return checkbox.checked;
}

function removeGutterNode(node)
{
    for (let i = 0; i < node.childNodes.length; i++)
    {
        if (    (node.childNodes[i].classList )
             && (node.childNodes[i].classList.contains("gutter")) 
        )
        {
            node.removeChild(node.childNodes[i]);
            break;
        }
    }
}

function cleanGutters()
{
    removeGutterNode(document.getElementById("bot"));
    removeGutterNode(document.getElementById("canvasdiv"));
}

function setBomCheckboxes(value)
{
    globalData.setBomCheckboxes(value);
    globalData.writeStorage("bomCheckboxes", value);
    populateBomTable();
}

function setRemoveBOMEntries(value)
{
    globalData.setRemoveBOMEntries(value);
    globalData.writeStorage("removeBOMEntries", value);
    populateBomTable();
}

function setAdditionalAttributes(value)
{
    globalData.setAdditionalAttributes(value);
    globalData.writeStorage("additionalAttributes", value);
    populateBomTable();
}

// XXX: None of this seems to be working. 
document.onkeydown = function(e)
{
    switch (e.key)
    {
    case "n":
        if (document.activeElement.type == "text")
        {
            return;
        }
        if (globalData.getCurrentHighlightedRowId() !== null)
        {
            // XXX: Why was the following line in the software
            //checkBomCheckbox(globalData.getCurrentHighlightedRowId(), "placed");
            highlightNextRow();
            e.preventDefault();
        }
        break;
    case "ArrowUp":
        highlightPreviousRow();
        e.preventDefault();
        break;
    case "ArrowDown":
        highlightNextRow();
        e.preventDefault();
        break;
    case "F11":
         e.preventDefault();
        break;
    default:
        break;
    }

    if (e.altKey)
    {
        switch (e.key)
        {
        case "f":
            focusBOMFilterField();
            e.preventDefault();
            break;
        case "z":
            changeBomLayout("BOM");
            e.preventDefault();
            break;
        case "x":
            changeBomLayout("LR");
            e.preventDefault();
            break;
        case "c":
            changeBomLayout("TB");
            e.preventDefault();
            break;
        case "v":
            changeCanvasLayout("F");
            e.preventDefault();
            break;
        case "b":
            changeCanvasLayout("FB");
            e.preventDefault();
            break;
        case "n":
            changeCanvasLayout("B");
            e.preventDefault();
            break;
        default:
            break;
        }
    }
};


// TODO: Remove global variable. Used to test feature.
document.getElementById("fullscreen-btn").classList.remove("depressed");
let isFullscreen = false;
function toggleFullScreen()
{
    if(isFullscreen)
    {
        document.getElementById("fullscreen-btn").classList.remove("depressed");
        isFullscreen = false;
        Fullscreen.closeFullscreen();
    }
    else
    {
        document.getElementById("fullscreen-btn").classList.add("depressed");
        isFullscreen = true;
        Fullscreen.openFullscreen();
    }
}


//XXX: I would like this to be in the html functions js file. But this function needs to be 
//     placed here, otherwise the application rendering becomes very very weird.
window.onload = function(e)
{
    console.time("on load");
    // This function makes so that the user data for the pcb is converted to our internal structure
    pcb.OpenPcbData(pcbdata)

    let versionNumberHTML = document.getElementById("softwareVersion");
    versionNumberHTML.innerHTML = version.GetVersionString();
    // Create canvas layers. One canvas per pcb layer

    globalData.initStorage();
    cleanGutters();
    // Must be called after loading PCB as rendering required the bounding box information for PCB
    render.initRender();

    // Set up mouse event handlers
    handlers_mouse.addMouseHandlers(document.getElementById("frontcanvas"), globalData.GetAllCanvas().front);
    handlers_mouse.addMouseHandlers(document.getElementById("backcanvas"), globalData.GetAllCanvas().back);


    bom = document.getElementById("bombody");
    layerBody = document.getElementById("layerbody");
    layerHead = document.getElementById("layerhead");
    bomhead = document.getElementById("bomhead");
    globalData.setBomLayout(globalData.readStorage("bomlayout"));
    if (!globalData.getBomLayout())
    {
        globalData.setBomLayout("LR");
    }
    globalData.setCanvasLayout(globalData.readStorage("canvaslayout"));
    if (!globalData.getCanvasLayout())
    {
        globalData.setCanvasLayout("FB");
    }

    populateLayerTable();

    populateMetadata();
    globalData.setBomCheckboxes(globalData.readStorage("bomCheckboxes"));
    if (globalData.getBomCheckboxes() === null)
    {
        globalData.setBomCheckboxes("Placed");
    }
    globalData.setRemoveBOMEntries(globalData.readStorage("removeBOMEntries"));
    if (globalData.getRemoveBOMEntries() === null)
    {
        globalData.setRemoveBOMEntries("");
    }
    globalData.setAdditionalAttributes(globalData.readStorage("additionalAttributes"));
    if (globalData.getAdditionalAttributes() === null)
    {
        globalData.setAdditionalAttributes("");
    }
    document.getElementById("bomCheckboxes").value = globalData.getBomCheckboxes();
    if (globalData.readStorage("silkscreenVisible") === "false")
    {
        document.getElementById("silkscreenCheckbox").checked = false;
        silkscreenVisible(false);
    }
    if (globalData.readStorage("redrawOnDrag") === "false")
    {
        document.getElementById("dragCheckbox").checked = false;
        globalData.setRedrawOnDrag(false);
    }
    if (globalData.readStorage("darkmode") === "true")
    {
        document.getElementById("darkmodeCheckbox").checked = true;
        setDarkMode(true);
    }
    if (globalData.readStorage("hidePlacedParts") === "true")
    {
        document.getElementById("hidePlacedParts").checked = true;
        globalData.setHidePlacedParts(true);
    }
    if (globalData.readStorage("highlightpin1") === "true")
    {
        document.getElementById("highlightpin1Checkbox").checked = true;
        globalData.setHighlightPin1(true);
        render.drawCanvas(globalData.GetAllCanvas().front);
        render.drawCanvas(globalData.GetAllCanvas().back);
    }
    // If this is true then combine parts and display quantity
    if (globalData.readStorage("combineValues") === "true")
    {
        document.getElementById("combineValues").checked = true;
        globalData.setCombineValues(true);
    }
    if (globalData.readStorage("debugMode") === "true")
    {
        document.getElementById("debugMode").checked = true;
        globalData.setDebugMode(true);
    }
    // Read the value of board rotation from local storage
    let boardRotation = globalData.readStorage("boardRotation");
    /*
      Adjusted to match how the update rotation angle is calculated.
    
        If null, then angle not in local storage, set to 180 degrees.
      */
    if (boardRotation === null)
    {
        boardRotation = 180;
    }
    else
    {
        boardRotation = parseInt(boardRotation);
    }
    // Set internal global variable for board rotation.
    globalData.SetBoardRotation(boardRotation);
    document.getElementById("boardRotation").value = (boardRotation-180) / 5;
    document.getElementById("rotationDegree").textContent = (boardRotation-180);

    // Triggers render
    changeBomLayout(globalData.getBomLayout());
    console.timeEnd("on load");
};

window.onresize = render.resizeAll;
window.matchMedia("print").addListener(render.resizeAll);

module.exports = {
    setDarkMode        , silkscreenVisible      , changeBomLayout, changeCanvasLayout,
    setBomCheckboxes   , populateBomTable       , setFilterBOM   , getFilterBOM      ,
    setFilterLayer     , getFilterLayer         , setRemoveBOMEntries, setAdditionalAttributes,
    toggleLayers, toggleFullScreen
};

},{"./fullscreen.js":3,"./global.js":4,"./handlers_mouse.js":5,"./pcb.js":8,"./render.js":9,"./version.js":19,"split.js":1}],8:[function(require,module,exports){
/*
    This file contains all of the definitions for working with pcbdata.json. 
    This file declares all of the access functions and interfaces for converting 
    the json file into an internal data structure. 
*/

"use strict";

/***************************************************************************************************
                                         PCB Part Interfaces
**************************************************************************************************/
// Read the ecad property. This property lets the application know what 
// ecad software generated the json file. 
function GetCADType(pcbdataStructure)
{
    if(pcbdataStructure.hasOwnProperty("ecad"))
    {
        return pcbdataStructure.ecad;
    }
}

// This will hold the part objects. There is one entry per part
// Format of a part is as follows
// [VALUE,PACKAGE,REFRENECE DESIGNATOR, ,LOCATION, ATTRIBUTE],
// where ATTRIBUTE is a dict of ATTRIBUTE NAME : ATTRIBUTE VALUE
let BOM = [];

// Constructor for creating a part.
function Part(value, footprint, reference, location, attributes, checkboxes)
{
    this.quantity   = 1;
    this.value      = value;
    this.footprint  = footprint;
    this.reference  = reference;
    this.location   = location;
    this.attributes = attributes;
    this.checkboxes = checkboxes;
}

function CopyPart(inputPart)
{
    // XXX: This is not performing a deep copy, attributes is a map and this is being copied by 
    //      reference which is not quite what we want here. It should be a deep copy so once called
    //      this will result in a completely new object that will not reference one another
    return new Part(inputPart.value, inputPart.package, inputPart.reference, inputPart.location, inputPart.attributes, inputPart.checkboxes);
}

//TODO: There should be steps here for validating the data and putting it into a 
//      format that is valid for our application
function CreateBOM(pcbdataStructure)
{
    // For every part in the input file, convert it to our internal 
    // representation data structure.
    for(let part of pcbdataStructure.parts)
    {
        // extract the part data. This is here so I can iterate the design 
        // when I make changes to the underlying json file.
        let value     = part.value;
        let footprint = "";
        let reference = part.name;
        let location  = part.location;

        // AttributeName and AttributeValue are two strings that are deliminated by ';'. 
        // Split the strings by ';' and then zip them together
        let attributeNames  = part.attributes.name.split(";");
        let attributeValues = part.attributes.value.split(";");

        let checkboxes = new Map();

        //XXX: ASSUMTION that attributeNames is the same length as attributeValues
        let attributes = new Map(); // Create a empty dictionary
        for(let i in attributeNames)
        {
            attributes.set(attributeNames[i].toLowerCase(),attributeValues[i].toLowerCase());
        }
        // Add the par to the global part array
        BOM.push(new Part(value, footprint, reference, location, attributes, checkboxes));
    }
}

function GetBOM()
{
    return BOM;
}

// TAkes a BOM table and a filter function. The filter 
// function is used onthe provided table to remove 
// any part that satisfy the filter
function filterBOMTable(bomtable, filterFunction)
{
    let result = [];

    // Makes sure that thE filter function is defined. 
    // if not defined then nothing should be filtered. 
    if(filterFunction != null)
    {
        for(let i in bomtable)
        {
            // If the filter returns false -> do not remove part, it does not need to be filtered
            if(!filterFunction(bomtable[i]))
            {
                result.push(CopyPart(bomtable[i]));
            }
        }
    }
    else
    {
        result = bomtable;
    }
    return result;
}

// Takes a bom table and combines entries that are the same
function GetBOMCombinedValues(bomtableTemp)
{
    let result = [];

    // TODO: sort bomtableTemp. Assumption here is that the bomtableTemp is presorted

    if(bomtableTemp.length>0)
    {
        // XXX: Assuming that the input json data has bom entries presorted
        // TODO: Start at index 1, and compare the current to the last, this should simplify the logic
        // Need to create a new object by deep copy. this is because objects by default are passed by reference and i dont 
        // want to modify them.
        result.push(CopyPart(bomtableTemp[0]));
        let count = 0;
        for (let n = 1; n < bomtableTemp.length;n++)
        {
            if(result[count].value == bomtableTemp[n].value)
            {
                // For parts that are listed as combined, store the references as an array.
                // This is because the logic for highlighting needs to match strings and 
                // If an appended string is used it might not work right
                let refString = result[count].reference + "," + bomtableTemp[n].reference;
                result[count].quantity += 1;
                result[count].reference = refString;
            }
            else
            {
                result.push(CopyPart(bomtableTemp[n]));
                count++;
            }
        }
    }
    return result;
}

function getAttributeValue(part, attributeToLookup)
{
    let attributes = part.attributes;
    let result = "";

    if(attributeToLookup == "name")
    {
        result = part.reference;
    }
    else
    {
        result = (attributes.has(attributeToLookup) ? attributes.get(attributeToLookup) : "");
    }
    // Check that the attribute exists by looking up its name. If it exists
    // the return the value for the attribute, otherwise return an empty string. 
    return result;
}


/***************************************************************************************************
                                         PCB Metadata Interfaces
***************************************************************************************************/
let metadata;
// Constructor for creating a part.
function Metadata(title, revision, company, date) 
{
    this.title    = title;
    this.revision = revision;
    this.company  = company;
    this.date     = date;
}

function CreateMetadata(pcbdataStructure)
{
    metadata = new Metadata( 
        pcbdataStructure.metadata.project_name, pcbdataStructure.metadata.revision,
        pcbdataStructure.metadata.company     , pcbdataStructure.metadata.date
    );
}

function GetMetadata()
{
    return metadata;
}

/***************************************************************************************************
                                         PCB Layers Interfaces
***************************************************************************************************/
let Layers = [];
let layer_Zindex = 0;

function GetLayers()
{
    return Layers;
}


function PCBLayer(name)
{
    this.name    = name;
    this.visible_front = true;
    this.visible_back = true;


    this.front_id = "layer_front_" + name;
    this.back_id  = "layer_rear_" + name;

    let canvas_front = document.getElementById("front-canvas-list");
    let layer_front = document.createElement("canvas");
    layer_front.id = this.front_id;
    layer_front.style.zIndex = layer_Zindex;
    layer_front.style.position = "absolute";
    layer_front.style.left = 0;
    layer_front.style.top = 0;
    canvas_front.appendChild(layer_front);


    let canvas_back = document.getElementById("back-canvas-list");
    let layer_back = document.createElement("canvas");
    layer_back.id = this.back_id;
    layer_back.style.zIndex = layer_Zindex;
    layer_back.style.position = "absolute";
    layer_back.style.left = 0;
    layer_back.style.top = 0;

    canvas_back.appendChild(layer_back);

    layer_Zindex = layer_Zindex + 1;
}

function SetLayerVisibility(layerName, isFront, visible)
{
    let layerIndex = Layers.findIndex(i => i.name === layerName);
    if(isFront)
    {
        // If item is not in the list 
        if( layerIndex !== -1)
        {
            // Layer exists. Check if visible
            Layers[layerIndex].visible_front = visible;

            // TODO: Refactor this. below is used to interface between the different layer 
            // setups that are currently being used but once switched to the new layer format
            // then the above will not be needed.
            let canvas = undefined; 
            if(visible)
            {
                canvas = document.getElementById(Layers[layerIndex].front_id);
                canvas.style.display="";
            }
            else
            {
                canvas = document.getElementById(Layers[layerIndex].front_id);
                canvas.style.display="none";
            }
        }
    }
    else
    {
        // If item is not in the list 
        if( layerIndex !== -1)
        {
            // Layer exists. Check if visible
            Layers[layerIndex].visible_back = visible;

            // TODO: Refactor this. below is used to interface between the different layer 
            // setups that are currently being used but once switched to the new layer format
            // then the above will not be needed.
            let canvas = undefined;
            if(visible)
            {
                canvas= document.getElementById(Layers[layerIndex].back_id);
                canvas.style.display="";
            }
            else
            {
                canvas= document.getElementById(Layers[layerIndex].back_id);
                canvas.style.display="none";
            }
        }
    }
}

function GetLayerCanvas(layerName, isFront)
{
    // Get the index of the PCB layer 
    // MAp used here to create a list of just the layer names, which indexOf can then  be used against.
    let index = Layers.map(function(e) { return e.name; }).indexOf(layerName);
    // Requested layer does not exist. Create new layer
    if(index === -1)
    {
        // Adds layer to layer stack
        Layers.push(new PCBLayer(layerName));
        index = Layers.length-1;
    }

    // Return the canvas instance
    if(isFront)
    {
        return document.getElementById(Layers[index].front_id);
    } 
    else
    {
        return document.getElementById(Layers[index].back_id);
    }
}

function CreateLayers(pcbdataStructure)
{
    // Extract layers from the trace section
    for( let trace of pcbdataStructure.board.traces)
    {
        for(let segment of trace.segments)
        {
            // Check that segment contains a layer definition
            if(segment.layer)
            {
                // If item is not in the list 
                if(Layers.findIndex(i => i.name === segment.layer) === -1)
                {
                    Layers.push(new PCBLayer(segment.layer));
                }
            }
        }
    }

    // Extract layers form the layers section
    for(let layer of pcbdataStructure.board.layers)
    {
        // If item is not in the list 
        if(Layers.findIndex(i => i.name === layer.name) === -1)
        {
            // Add the par to the global part array
            Layers.push(new PCBLayer(layer.name));
        }
    }

    // XXX: Need another way to extract all layers from input
    Layers.push(new PCBLayer("edges"));
    Layers.push(new PCBLayer("pads"));
    Layers.push(new PCBLayer("highlights"));
}


function IsLayerVisible(layerName, isFront)
{
    let result = true;
    let layerIndex = Layers.findIndex(i => i.name === layerName);

    // This means that the layer is always visible. 
    if(layerName == "all")
    {
        result = true;
    }
    else if(isFront)
    {
        // If item is not in the list 
        if( layerIndex === -1)
        {
            result = false;
        }
        else
        {
            // Layer exists. Check if visible
            result = Layers[layerIndex].visible_front;
        }
    }
    else
    {
        // If item is not in the list 
        if( layerIndex === -1)
        {
            result = false;
        }
        else
        {
            // Layer exists. Check if visible
            result = Layers[layerIndex].visible_back;
        }
    }

    return result;
}

function OpenPcbData(pcbdata)
{
    CreateBOM(pcbdata);
    CreateMetadata(pcbdata);
    CreateLayers(pcbdata);
}

module.exports = {
    OpenPcbData, GetBOM, getAttributeValue, GetBOMCombinedValues, filterBOMTable, GetMetadata, 
    GetLayers, IsLayerVisible, SetLayerVisibility, GetLayerCanvas, GetCADType
};
},{}],9:[function(require,module,exports){
/* PCB rendering code */

"use strict";

var globalData         = require("./global.js");
var render_pads        = require("./render/render_pad.js");
var render_via         = require("./render/render_via.js");
var render_trace       = require("./render/render_trace.js");
var render_boardedge   = require("./render/render_boardedge.js");
var render_silkscreen  = require("./render/render_silkscreen.js");
var render_canvas      = require("./render/render_canvas.js");
var render_boundingbox = require("./render/render_boundingbox.js");
var Point              = require("./render/point.js").Point;
var pcb                = require("./pcb.js");
var colorMap           = require("./colormap.js");


//REMOVE: Using to test alternate placed coloring
let isPlaced = false;



function DrawPad(ctx, pad, color) 
{
    if (pad.shape == "rect") 
    {
        render_pads.Rectangle(ctx, pad, color);
    } 
    else if (pad.shape == "oblong") 
    {
        render_pads.Oblong(ctx, pad, color);
    } 
    else if (pad.shape == "round") 
    {
        render_pads.Round(ctx, pad, color);
    } 
    else if (pad.shape == "octagon") 
    {
        render_pads.Octagon(ctx, pad, color);
    } 
    else
    {
        console.log("ERROR: Unsupported pad type ", pad.shape);
    }
}

function DrawPCBEdges(isViewFront, scalefactor) 
{
    let ctx = pcb.GetLayerCanvas("edges", isViewFront).getContext("2d");
    let color = colorMap.GetPCBEdgeColor();

    for (let edge of pcbdata.board.pcb_shape.edges) 
    {
        if(edge.pathtype == "line")
        {
            let lineWidth = Math.max(1 / scalefactor, edge.width);
            render_boardedge.Line(ctx, edge, lineWidth, color);
        }
        else if(edge.pathtype == "arc")
        {
            let lineWidth = Math.max(1 / scalefactor, edge.width);
            render_boardedge.Arc(ctx, edge, lineWidth, color);
        }
        else
        {
            console.log("unsupported board edge segment type", edge.pathtype);
        }
    }
}

function DrawTraces(isViewFront, scalefactor)
{
    // Iterate over all traces in the design
    for (let trace of pcbdata.board.traces)
    {
        // iterate over all segments in a trace 
        for (let segment of trace.segments)
        {
            let ctx = pcb.GetLayerCanvas(segment.layer, isViewFront).getContext("2d")

            if(segment.pathtype == "line")
            {
                let lineWidth = Math.max(1 / scalefactor, segment.width);
                render_trace.Line(ctx, segment, lineWidth, colorMap.GetTraceColor(segment.layerNumber-1));
            }
            else if(segment.pathtype == "arc")
            {
                let lineWidth = Math.max(1 / scalefactor, segment.width);
                render_trace.Arc(ctx, segment, lineWidth, colorMap.GetTraceColor(segment.layerNumber-1));
            }
            else if (segment.pathtype == "polygon")
            {
                let lineWidth = Math.max(1 / scalefactor, segment.width);
                // Need to specify a color at full transparency so that a negative polygon 
                // can be subtracted from a positive polygon.
                let color = (segment.positive == 1) ? colorMap.GetTraceColor(segment.layerNumber-1) : "#000000FF";
                render_trace.Polygon(ctx, segment.segments, lineWidth, color, segment.positive === "1");
            }
            else if( segment.pathtype == "via_round")
            {
                let centerPoint = new Point(segment.x, segment.y);
                render_via.Round(
                    ctx
                    , centerPoint
                    , segment.diameter
                    , segment.drill
                    , colorMap.GetViaColor()
                    , colorMap.GetDrillColor()
                );
            }
            else if( segment.pathtype == "via_octagon")
            {
                let centerPoint = new Point(segment.x, segment.y);
                render_via.Octagon(
                    ctx
                    , centerPoint
                    , segment.diameter
                    , segment.drill
                    , colorMap.GetViaColor()
                    , colorMap.GetDrillColor()
                );
            }
            else if( segment.pathtype == "via_square")
            {
                let centerPoint = new Point(segment.x, segment.y);
                render_via.Square(
                    ctx
                    , centerPoint
                    , segment.diameter
                    , segment.drill
                    , colorMap.GetViaColor()
                    , colorMap.GetDrillColor()
                );
            }
            else
            {
                console.log("unsupported trace segment type");
            }
        }
    }
}

function DrawSilkscreen(isViewFront, scalefactor)
{
    let color = "#aa4";

    for (let layer of pcbdata.board.layers)
    {
        let ctx = pcb.GetLayerCanvas(layer.name, isViewFront).getContext("2d");

       if(layer.layerNumber-1 < 16)
        {
            color = colorMap.GetTraceColor(layer.layerNumber-1);
        }
        else
        {
            color = "#aa4"
        }
        
        for (let path of layer.paths)
        {
            if(path.pathtype == "line")
            {
                let lineWidth = Math.max(1 / scalefactor, path.width);
                render_silkscreen.Line(ctx, path, lineWidth, color);
            }
            else if(path.pathtype == "arc")
            {
                let lineWidth = Math.max(1 / scalefactor, path.width);
                render_silkscreen.Arc(ctx, path, lineWidth, color);
            }
            else if(path.pathtype == "circle")
            {
                let lineWidth = Math.max(1 / scalefactor, path.width);
                render_silkscreen.Circle(ctx, path, lineWidth, color);
            }
            else
            {
                console.log("unsupported silkscreen path segment type", path.pathtype);
            }
        }
    }
}

function DrawModule(isViewFront, layer, scalefactor, part, highlight) 
{
    if (highlight || globalData.getDebugMode())
    {
        let ctx = pcb.GetLayerCanvas("highlights", isViewFront).getContext("2d");
        // draw bounding box
        if (part.location == layer)
        {
            let color_BoundingBox = colorMap.GetBoundingBoxColor(highlight, isPlaced);
            render_boundingbox.Rectangle(ctx, part.package.bounding_box, color_BoundingBox);
        }
        // draw pads
        for (let pad of part.package.pads) 
        {
            /*
                Check that part on layer should be drawn. Will draw when requested layer 
                matches the parts layer.
            
              If the part is through hole it needs to be drawn on each layer
              otherwise the part is an smd and should only be drawn on a the layer it belongs to.
            */
            if (    (pad.pad_type == "tht")
                 || ((pad.pad_type == "smd") && (part.location == layer))
            )
            {
                let highlightPin1 = ((pad.pin1 == "yes")  && globalData.getHighlightPin1());
                let color_pad = colorMap.GetPadColor(highlightPin1, highlight, isPlaced);
                DrawPad(ctx, pad, color_pad);
            }
        }
    }

    // draw pads
    for (let pad of part.package.pads) 
    {
        /*
            Check that part on layer should be drawn. Will draw when requested layer 
            matches the parts layer.
        
          If the part is through hole it needs to be drawn on each layer
          otherwise the part is an smd and should only be drawn on a the layer it belongs to.
        */
        if (    (pad.pad_type == "tht")
             || ((pad.pad_type == "smd") && (part.location == layer))
        )
        {
            let highlightPin1 = ((pad.pin1 == "yes")  && globalData.getHighlightPin1());
            let color_pad = colorMap.GetPadColor(highlightPin1, false, isPlaced);
            let ctx = pcb.GetLayerCanvas("pads", isViewFront).getContext("2d");
            DrawPad(ctx, pad, color_pad);
        }
    }
}

function DrawModules(isViewFront, layer, scalefactor, highlightedRefs)
{
    for (let part of pcbdata.parts) 
    {
        let highlight = highlightedRefs.includes(part.name);
        if (highlightedRefs.length == 0 || highlight) 
        {
            DrawModule(isViewFront, layer, scalefactor, part, highlight);
        }
    }
}

function drawCanvas(canvasdict)
{
    render_canvas.RedrawCanvas(canvasdict);
    let isViewFront = (canvasdict.layer === "F");
    DrawPCBEdges  (isViewFront, canvasdict.transform.s);
    DrawModules   (isViewFront, canvasdict.layer, canvasdict.transform.s, []);
    DrawTraces    (isViewFront, canvasdict.transform.s);
    // Draw last so that text is not erased when drawing polygons.
    DrawSilkscreen(isViewFront, canvasdict.transform.s);
}

function RotateVector(v, angle)
{
    return render_canvas.rotateVector(v, angle);
}



function initRender()
{
    let allcanvas = {
        front: {
            transform: {
                x: 0,
                y: 0,
                s: 1,
                panx: 0,
                pany: 0,
                zoom: 1,
                mousestartx: 0,
                mousestarty: 0,
                mousedown: false,
            },
            layer: "F",
        },
        back: {
            transform: {
                x: 0,
                y: 0,
                s: 1,
                panx: 0,
                pany: 0,
                zoom: 1,
                mousestartx: 0,
                mousestarty: 0,
                mousedown: false,
            },
            layer: "B",
        }
    };
    // Sets the data strucure to a default value. 
    globalData.SetAllCanvas(allcanvas);
    // Set the scale so the PCB will be scaled and centered correctly.
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().front);
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().back);
    
}

function drawHighlightsOnLayer(canvasdict) 
{
    let isViewFront = (canvasdict.layer === "F");
    render_canvas.ClearHighlights(canvasdict);
    DrawModules   (isViewFront, canvasdict.layer, canvasdict.transform.s, globalData.getHighlightedRefs());
}

function drawHighlights(passed) 
{
    isPlaced=passed;
    drawHighlightsOnLayer(globalData.GetAllCanvas().front);
    drawHighlightsOnLayer(globalData.GetAllCanvas().back);
}

function resizeAll() 
{
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().front);
    render_canvas.ResizeCanvas(globalData.GetAllCanvas().back);
    drawCanvas(globalData.GetAllCanvas().front);
    drawCanvas(globalData.GetAllCanvas().back);
}

function SetBoardRotation(value) 
{
    /*
        The board when drawn by default is show rotated -180 degrees. 
        The following will add 180 degrees to what the user calculates so that the PCB
        will be drawn in the correct orientation, i.e. displayed as shown in ECAD program. 
        Internally the range of degrees is stored as 0 -> 360
    */
    globalData.SetBoardRotation((value * 5)+180);
    globalData.writeStorage("boardRotation", globalData.GetBoardRotation());
    /*
        Display the correct range of degrees which is -180 -> 180. 
        The following just remaps 360 degrees to be in the range -180 -> 180.
    */
    document.getElementById("rotationDegree").textContent = (globalData.GetBoardRotation()-180);
    resizeAll();
}

module.exports = {
    initRender, resizeAll, drawCanvas, drawHighlights, RotateVector, SetBoardRotation
};
},{"./colormap.js":2,"./global.js":4,"./pcb.js":8,"./render/point.js":10,"./render/render_boardedge.js":11,"./render/render_boundingbox.js":12,"./render/render_canvas.js":13,"./render/render_pad.js":15,"./render/render_silkscreen.js":16,"./render/render_trace.js":17,"./render/render_via.js":18}],10:[function(require,module,exports){
"use strict";
/**
 * 
 * @param {*} x 
 * @param {*} y 
 */
function Point(x,y)
{
    this.x = x;
    this.y = y;
}



module.exports = {
    Point
};

},{}],11:[function(require,module,exports){
"use strict";
var render_lowlevel     = require("./render_lowlevel.js");
var Point               = require("./point.js").Point;

// Line width is not included as part of the trace as it will depend on the current gui scale factor.
function Arc(guiContext, trace, lineWidth, color)
{

    let centerPoint = new Point(trace.cx0, trace.cy0);


    let renderOptions = { 
        color: color,
        fill: false,
        lineWidth: lineWidth,
        lineCap: "round" 
    };

    render_lowlevel.Arc( 
        guiContext,
        centerPoint,
        trace.radius,
        trace.angle0,
        trace.angle1,
        renderOptions
    );
}

function Line(guiContext, trace, lineWidth, color)
{
    let startPoint = new Point(trace.x0, trace.y0);
    let endPoint   = new Point(trace.x1, trace.y1);

    let renderOptions = { 
        color: color,
        fill: false,
        lineWidth: lineWidth,
        lineCap: "round" 
    };

    render_lowlevel.Line( 
        guiContext,
        startPoint,
        endPoint,
        renderOptions
    );
}

module.exports = {
    Arc, Line
};

},{"./point.js":10,"./render_lowlevel.js":14}],12:[function(require,module,exports){
"use strict";
var render_lowlevel     = require("./render_lowlevel.js");
var Point               = require("./point.js").Point;

// Line width is not included as part of the trace as it will depend on the current gui scale factor.
function Rectangle(guiContext, boundingBox, color)
{
    let centerPoint = new Point(0, 0);
    /*
            The following derive the corner points for the
            rectangular pad. These are calculated using the center 
            point of the rectangle along with the width and height 
            of the rectangle. 
    */
    // Top left point
    let point0 = new Point(boundingBox.x0, boundingBox.y0);
    // Top right point
    let point1 = new Point(boundingBox.x1, boundingBox.y0);
    // Bottom right point
    let point2 = new Point(boundingBox.x1, boundingBox.y1);
    // Bottom left point
    let point3 = new Point(boundingBox.x0, boundingBox.y1);

    // First fill the box. 
    let renderOptions = {
        color: color,
        fill: true,
        globalAlpha: 0.2
    };

    render_lowlevel.RegularPolygon( 
        guiContext,
        centerPoint, 
        [point0, point1, point2, point3],
        0,
        renderOptions
    );

    // Now stoke the box
    renderOptions = {
        color: color,
        fill: false,
        globalAlpha: 1, 
        lineWidth: 0.33
    };

    render_lowlevel.RegularPolygon( 
        guiContext,
        centerPoint, 
        [point0, point1, point2, point3],
        0,
        renderOptions
    );
}

module.exports = {
    Rectangle
};

},{"./point.js":10,"./render_lowlevel.js":14}],13:[function(require,module,exports){
"use strict";
var pcb        = require("../pcb.js");
var globalData = require("../global.js");


function prepareCanvas(canvas, flip, transform) 
{
    let ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(transform.zoom, transform.zoom);
    ctx.translate(transform.panx, transform.pany);
    if (flip) 
    {
        ctx.scale(-1, 1);
    }
    ctx.translate(transform.x, transform.y);
    ctx.rotate(globalData.GetBoardRotation()*Math.PI/180);
    ctx.scale(transform.s, transform.s);
}

function rotateVector(v, angle) 
{
    angle = angle*Math.PI/180;
    return [
        v[0] * Math.cos(angle) - v[1] * Math.sin(angle),
        v[0] * Math.sin(angle) + v[1] * Math.cos(angle)
    ];
}

function recalcLayerScale(canvasdict, canvas) 
{
    let layerID = (canvasdict.layer === "F") ? "frontcanvas" : "backcanvas" ;
    let width   = document.getElementById(layerID).clientWidth * 2;
    let height  = document.getElementById(layerID).clientHeight * 2;
    let bbox    = applyRotation(pcbdata.board.pcb_shape.bounding_box);
    let scalefactor = 0.98 * Math.min( width / (bbox.maxx - bbox.minx), height / (bbox.maxy - bbox.miny));

    if (scalefactor < 0.1)
    {
        //scalefactor = 1;
    }

    canvasdict.transform.s = scalefactor;

    if ((canvasdict.layer != "B"))
    {
        canvasdict.transform.x = -((bbox.maxx + bbox.minx) * scalefactor + width) * 0.5;
    }
    else
    {
        canvasdict.transform.x = -((bbox.maxx + bbox.minx) * scalefactor - width) * 0.5;
    }
    canvasdict.transform.y = -((bbox.maxy + bbox.miny) * scalefactor - height) * 0.5;

    if(canvasdict.layer ==="F")
    {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = (width / 2) + "px";
        canvas.style.height = (height / 2) + "px";
    }
    else
    {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = (width / 2) + "px";
        canvas.style.height = (height / 2) + "px";
    }
}

function applyRotation(bbox) 
{
    let corners = [
        [bbox.minx, bbox.miny],
        [bbox.minx, bbox.maxy],
        [bbox.maxx, bbox.miny],
        [bbox.maxx, bbox.maxy],
    ];
    corners = corners.map((v) => rotateVector(v, globalData.GetBoardRotation()));
    return {
        minx: corners.reduce((a, v) => Math.min(a, v[0]), Infinity),
        miny: corners.reduce((a, v) => Math.min(a, v[1]), Infinity),
        maxx: corners.reduce((a, v) => Math.max(a, v[0]), -Infinity),
        maxy: corners.reduce((a, v) => Math.max(a, v[1]), -Infinity),
    };
}


function ClearHighlights(canvasdict)
{
    let canvas = pcb.GetLayerCanvas("highlights", (canvasdict.layer === "F"));
    ClearCanvas(canvas);
}

function ClearCanvas(canvas) 
{
    let ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

function prepareLayer(canvasdict, canvas)
{
    let flip = (canvasdict.layer != "B");

    if(canvasdict.layer === "F")
    {
        prepareCanvas(canvas, flip, canvasdict.transform);
    }
    else
    {
        prepareCanvas(canvas, flip, canvasdict.transform);
    }
}

function RedrawCanvas(layerdict)
{
    let pcbLayers = pcb.GetLayers();

    if(layerdict.layer === "F")
    {
        let canvas = undefined;
        for (let i = 0; i < pcbLayers.length; i++) 
        {
            canvas = document.getElementById(pcbLayers[i].front_id);
            prepareLayer(layerdict, canvas);
            ClearCanvas(canvas);
        }
    }
    else
    {
        let canvas = undefined;
        for (let i = 0; i < pcbLayers.length; i++) 
        {
            canvas = document.getElementById(pcbLayers[i].back_id);
            prepareLayer(layerdict, canvas);
            ClearCanvas(canvas);
        }
    }
}

function ResizeCanvas(layerdict)
{
    let flip = (layerdict.layer != "B");
    let pcbLayers = pcb.GetLayers();
    
    if(layerdict.layer === "F")
    {
        let canvas = undefined;
        for (let i = 0; i < pcbLayers.length; i++) 
        {
            canvas = document.getElementById(pcbLayers[i].front_id);
            recalcLayerScale(layerdict, canvas);
            prepareCanvas(canvas, flip, layerdict.transform);
            ClearCanvas(canvas);
        }
    }
    else
    {
        let canvas = undefined;
        for (let i = 0; i < pcbLayers.length; i++) 
        {
            canvas = document.getElementById(pcbLayers[i].back_id);
            recalcLayerScale(layerdict, canvas);
            prepareCanvas(canvas, flip, layerdict.transform);
            ClearCanvas(canvas);
        }
    }
}


module.exports = {
    ResizeCanvas, RedrawCanvas, rotateVector, ClearHighlights
};



},{"../global.js":4,"../pcb.js":8}],14:[function(require,module,exports){
"use strict";

var Point = require("./point.js").Point;

function Arc(guiContext, centerPoint, radius, angleStart, angleEnd, renderOptions )
{
    guiContext.save();

    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }

    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.lineCap)
    {
        guiContext.lineCap = renderOptions.lineCap;
    }


    // https://www.w3schools.com/tags/canvas_arc.asp
    guiContext.beginPath();
    guiContext.arc( centerPoint.x, centerPoint.y, radius, angleStart*Math.PI/180, angleEnd*Math.PI/180);

    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}

function Line(guiContext, startPoint, endPoint, renderOptions )
{
    guiContext.save();

    if( renderOptions.color)
    {
        guiContext.fillStyle   =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }

    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.lineCap)
    {
        guiContext.lineCap = renderOptions.lineCap;
    }

    guiContext.beginPath();
    guiContext.moveTo(startPoint.x, startPoint.y);
    guiContext.lineTo(endPoint.x, endPoint.y);

    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}

function RegularPolygon(guiContext, centerPoint, vertices, angle, renderOptions )
{

    guiContext.save();
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }
    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.globalAlpha)
    {
        guiContext.globalAlpha = renderOptions.globalAlpha;
    }

    guiContext.translate(centerPoint.x, centerPoint.y);
    /* 
       Rotate origin based on angle given
       NOTE: compared to oblong pads, no additional modification is required
             of angle to get the angle to rotate correctly.
    */
    guiContext.rotate(angle*Math.PI/180);

    /* 
       Rotate origin based on angle given
       NOTE: compared to oblong pads, no additional modification is required
             of angle to get the angle to rotate correctly.
    */
    //guiContext.rotate((angle)*Math.PI/180);

    guiContext.beginPath();
    guiContext.moveTo(vertices[0].x,vertices[0].y);

    for(var i = 1; i < vertices.length; i++)
    {
        guiContext.lineTo(vertices[i].x,vertices[i].y);
    }
    guiContext.closePath();
    
    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}


function IrregularPolygon(guiContext, vertices, renderOptions )
{

    guiContext.save();
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }
    // If overwriting line width, then update that here
    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    if(renderOptions.globalAlpha)
    {
        guiContext.globalAlpha = renderOptions.globalAlpha;
    }

    if(renderOptions.compositionType)
    {
        guiContext.globalCompositeOperation  = renderOptions.compositionType;
    }

    guiContext.beginPath();
    guiContext.moveTo(vertices[0].x,vertices[0].y);

    for(var i = 1; i < vertices.length; i++)
    {
        guiContext.lineTo(vertices[i].x,vertices[i].y);
    }
    guiContext.closePath();

    // If fill is true, fill the box, otherwise just make an outline
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();

}


function Circle(guiContext, centerPoint, radius, renderOptions)
{
    guiContext.save();
    
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;        
    }

    if(renderOptions.lineWidth)
    {
        guiContext.lineWidth = renderOptions.lineWidth;
    }

    /* Draw the drill hole */
    guiContext.beginPath();
    guiContext.arc(centerPoint.x,centerPoint.y, radius, 0, 2*Math.PI);

    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    guiContext.restore();
}


/*
    To render an oval some javascript trickery is used. To half circles are rendered, 
    and since by default when drawing shapes they will by default be connected by at 
    least one point if close path is not called. So by just calling the top and bottom 
    half circles, the rectangular center of the half circle will be filled.
*/
function Oval(guiContext, centerPoint, height, width, angle, renderOptions)
{

    // Center point of both circles.
    let centerPoint1 = new Point(0, -height/2);
    let centerPoint2 = new Point(0, height/2);
    let radius = width/2;

    guiContext.save();
    if( renderOptions.color)
    {
        guiContext.fillStyle  =  renderOptions.color;
        guiContext.strokeStyle =  renderOptions.color;
    }

    /*
        The following only really needs to draw two semicircles as internally the semicircles will 
        attach to each other to create the completed object.
     */

    guiContext.translate(centerPoint.x, centerPoint.y);
    /* 
       Rotate origin based on angle given
       NOTE: For some reason EagleCAD items are rotated by 90 degrees by default. 
             This corrects for that so items are displayed correctly.
             This seems to also only be required for oblong pads. This is most likely due to the 
             arc functions used.
    */
    guiContext.rotate((angle-90)*Math.PI/180);

    guiContext.beginPath();
    guiContext.arc(centerPoint1.x, centerPoint1.y, radius, Math.PI,0);
    guiContext.arc(centerPoint2.x, centerPoint2.y, radius, 0, Math.PI );
    guiContext.closePath();
    
    if(renderOptions.fill)
    {
        guiContext.fill();
    }
    else
    {
        guiContext.stroke();
    }

    // Restores context to state prior to this rendering function being called. 
    guiContext.restore();
}


module.exports = {
    Arc, Line, RegularPolygon, IrregularPolygon, Circle, Oval
};

},{"./point.js":10}],15:[function(require,module,exports){
"use strict";
var render_lowlevel     = require("./render_lowlevel.js");
var Point               = require("./point.js").Point;

function DrawDrillHole(guiContext, x, y, radius)
{

    let centerPoint = new Point(x, y);


    let renderOptions = {
        color: "#CCCCCC",
        fill: true,
    };

    render_lowlevel.Circle(
        guiContext,
        centerPoint,                         
        radius, 
        renderOptions
    );                     
}

function Rectangle(guiContext, pad, color)
{
    let centerPoint = new Point(pad.x, pad.y);

    /*
            The following derive the corner points for the
            rectangular pad. These are calculated using the center 
            point of the rectangle along with the width and height 
            of the rectangle. 
    */
    // Top left point
    let point0 = new Point(-pad.dx/2, pad.dy/2);
    // Top right point
    let point1 = new Point(pad.dx/2, pad.dy/2);
    // Bottom right point
    let point2 = new Point(pad.dx/2, -pad.dy/2);
    // Bottom left point
    let point3 = new Point(-pad.dx/2, -pad.dy/2);


    let renderOptions = {
        color: color,
        fill: true,
    };

    render_lowlevel.RegularPolygon( 
        guiContext,
        centerPoint, 
        [point0, point1, point2, point3],
        pad.angle,
        renderOptions
    );

    if(pad.pad_type == "tht")
    {
        DrawDrillHole(guiContext, pad.x, pad.y, pad.drill/2);
    }
}

/*
    An oblong pad can be thought of as having a rectangular middle with two semicircle ends. 

    EagleCAD provides provides three pieces of information for generating these pads. 
        1) Center point = Center of part
        2) Diameter = distance from center point to edge of semicircle
        3) Elongation =% ratio relating diameter to width

    The design also has 4 points of  interest, each representing the 
    corner of the rectangle. 

    To render the length and width are derived. This is divided in half to get the 
    values used to translate the central point to one of the verticies. 
*/
function Oblong(guiContext, pad, color)
{    
    // Diameter is the disnce from center of pad to tip of circle
    // elongation is a factor that related the diameter to the width
    // This is the total width
    let width   = pad.diameter*pad.elongation/100;
    
    // THe width of the rectangle is the diameter -half the radius.
    // See documentation on how these are calculated.
    let height  = (pad.diameter-width/2)*2;

    // assumes oval is centered at (0,0)
    let centerPoint = new Point(pad.x, pad.y);

    let renderOptions = { 
        color: color,
        fill: true,
    };

    render_lowlevel.Oval( 
        guiContext,
        centerPoint,
        height,
        width,
        pad.angle,
        renderOptions
    );

    /* Only draw drill hole if tht type pad */
    if(pad.pad_type == "tht")
    {
        DrawDrillHole(guiContext, pad.x, pad.y, pad.drill/2);
    }
}

function Round(guiContext, pad, color)
{
    let centerPoint = new Point(pad.x, pad.y);

    let renderOptions = {
        color: color,
        fill: true,
    };

    render_lowlevel.Circle( 
        guiContext,
        centerPoint,                         
        pad.drill, 
        renderOptions
    ); 

    if(pad.pad_type == "tht")
    {
        DrawDrillHole(guiContext, pad.x, pad.y, pad.drill/2);
    }
}

function Octagon(guiContext, pad, color)
{
    // Will store the verticies of the polygon.
    let polygonVerticies = [];

    
    let n = 8;
    let r = pad.diameter/2;
    // Assumes a polygon centered at (0,0)
    for (let i = 1; i <= n; i++) 
    {
        polygonVerticies.push(new Point(r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)));
    }

    let angle = (pad.angle+45/2);
    let centerPoint = new Point(pad.x, pad.y);

    let renderOptions = { 
        color: color,
        fill: true,
    };

    render_lowlevel.RegularPolygon( 
        guiContext,
        centerPoint, 
        polygonVerticies,
        angle,
        renderOptions
    );

    /* Only draw drill hole if tht type pad */
    if(pad.pad_type == "tht")
    {
        DrawDrillHole(guiContext, pad.x, pad.y, pad.drill/2);
    }
}

module.exports = {
    Rectangle, Oblong, Round, Octagon
};

},{"./point.js":10,"./render_lowlevel.js":14}],16:[function(require,module,exports){
"use strict";
var render_lowlevel     = require("./render_lowlevel.js");
var Point               = require("./point.js").Point;

// Line width is not included as part of the trace as it will depend on the current gui scale factor.
function Arc(guiContext, trace, lineWidth, color)
{

    let centerPoint = new Point(trace.cx0, trace.cy0);


    let renderOptions = { 
        color: color,
        fill: false,
        lineWidth: lineWidth,
        lineCap: "round" 
    };

    render_lowlevel.Arc( 
        guiContext,
        centerPoint,
        trace.radius,
        trace.angle0,
        trace.angle1,
        renderOptions
    );
}

function Line(guiContext, trace, lineWidth, color)
{
    let startPoint = new Point(trace.x0, trace.y0);
    let endPoint   = new Point(trace.x1, trace.y1);

    let renderOptions = { 
        color: color,
        fill: false,
        lineWidth: lineWidth,
        lineCap: "round" 
    };

    render_lowlevel.Line( 
        guiContext,
        startPoint,
        endPoint,
        renderOptions
    );
}

// Line width is not included as part of the trace as it will depend on the current gui scale factor.
function Circle(guiContext, trace, lineWidth, color)
{

    let centerPoint = new Point(trace.cx0, trace.cy0);

    let renderOptions = { 
        color: color,
        fill: false,
        lineWidth: lineWidth,
        lineCap: "round" 
    };

    render_lowlevel.Arc( 
        guiContext,
        centerPoint,
        trace.radius,
        0, 
        2*Math.PI,
        renderOptions
    );
}

module.exports = {
    Arc, Line, Circle
};

},{"./point.js":10,"./render_lowlevel.js":14}],17:[function(require,module,exports){
"use strict";
var render_lowlevel     = require("./render_lowlevel.js");
var Point               = require("./point.js").Point;

// Line width is not included as part of the trace as it will depend on the current gui scale factor.
function Arc(guiContext, trace, lineWidth, color)
{

    let centerPoint = new Point(trace.cx0, trace.cy0);

    let renderOptions = { 
        color: color,
        fill: false,
        lineWidth: lineWidth,
        lineCap: "round" 
    };

    render_lowlevel.Arc( 
        guiContext,
        centerPoint,
        trace.radius,
        trace.angle0,
        trace.angle1,
        renderOptions
    );
}

function Line(guiContext, trace, lineWidth, color)
{
    let startPoint = new Point(trace.x0, trace.y0);
    let endPoint   = new Point(trace.x1, trace.y1);

    let renderOptions = { 
        color: color,
        fill: false,
        lineWidth: lineWidth,
        lineCap: "round" 
    };
    render_lowlevel.Line(
        guiContext,
        startPoint,
        endPoint,
        renderOptions
    );
}

function Polygon(guiContext, segments, lineWidth, color, isPositive)
{
    let vertices = [];
    for (let i of segments)
    {
        let point1 = new Point(i.x0, i.y0);
        vertices.push(point1);
    }
    let compositionType = (isPositive) ? "source-over" : "destination-out";

    let renderOptions = { color: color,
        fill: true,
        compositionType: compositionType
    };

    render_lowlevel.IrregularPolygon( 
        guiContext,
        vertices,
        renderOptions
    );
}

module.exports = {
    Arc, Line, Polygon
};

},{"./point.js":10,"./render_lowlevel.js":14}],18:[function(require,module,exports){
"use strict";
var render_lowlevel     = require("./render_lowlevel.js");
var Point               = require("./point.js").Point;


function GetPolygonVerticies(radius, numberSized)
{
    // Will store the verticies of the polygon.
    let polygonVerticies = [];
    // Assumes a polygon centered at (0,0)
    // Assumes that a circumscribed polygon. The formulas used belo are for a inscribed polygon. 
    // To convert between a circumscribed to an inscribed polygon, the radius for the outer polygon needs to be calculated.
    // Some of the theory for below comes from 
    // https://www.maa.org/external_archive/joma/Volume7/Aktumen/Polygon.html
    // // Its is some basic trig and geometry
    let alpha = (2*Math.PI / (2*numberSized));
    let inscribed_radius = radius /Math.cos(alpha);
    for (let i = 1; i <= numberSized; i++) 
    {

        polygonVerticies.push(new Point(inscribed_radius * Math.cos(2 * Math.PI * i / numberSized), inscribed_radius * Math.sin(2 * Math.PI * i / numberSized)));
    }

    return polygonVerticies;
}

function Square(guiContext, centerPoint, diameter, drillDiameter, colorVia, colorDrill)
{
    let polygonVerticies = GetPolygonVerticies(diameter/2, 4);

    // This is needed in order so that the shape is rendered with correct orientation, ie top of 
    // shape is parallel to top and bottom of the display.
    let angle = 45;

    let renderOptions = {
        color: colorVia,
        fill: true,
    };

    render_lowlevel.RegularPolygon( 
        guiContext,
        centerPoint, 
        polygonVerticies,
        angle,
        renderOptions
    );

    // Draw drill hole
    renderOptions = {
        color: colorDrill,
        fill: true,
    };

    render_lowlevel.Circle( 
        guiContext,
        centerPoint,
        drillDiameter/2, 
        renderOptions
    ); 
}

function Octagon(guiContext, centerPoint, diameter, drillDiameter, colorVia, colorDrill)
{
    // Will store the verticies of the polygon.
    let polygonVerticies = GetPolygonVerticies(diameter/2, 8);
    let angle = (45/2);

    let renderOptions = { 
        color: colorVia,
        fill: true,
    };

    render_lowlevel.RegularPolygon( 
        guiContext,
        centerPoint, 
        polygonVerticies,
        angle,
        renderOptions
    );

    // Draw drill hole
    renderOptions = {
        color: colorDrill,
        fill: true,
    };

    render_lowlevel.Circle( 
        guiContext,
        centerPoint,
        drillDiameter/2, 
        renderOptions
    ); 
}

function Round(guiContext, centerPoint, diameter, drillDiameter, colorVia, colorDrill)
{

    let renderOptions = {
        color: colorVia,
        fill: true,
    };

    render_lowlevel.Circle( 
        guiContext,
        centerPoint,
        diameter/2, 
        renderOptions
    ); 
    
    // Draw drill hole
    renderOptions = {
        color: colorDrill,
        fill: true,
    };

    render_lowlevel.Circle( 
        guiContext,
        centerPoint,
        drillDiameter/2, 
        renderOptions
    ); 

    // Restores context to state prior to this rendering function being called. 
    guiContext.restore();
}

module.exports = {
    Square, Octagon, Round,
};

},{"./point.js":10,"./render_lowlevel.js":14}],19:[function(require,module,exports){
"use strict";

let versionString_Major = 2;
let versionString_Minor = 3;
let versionString_Patch = 1;

function GetVersionString()
{

    let result = 'V' + String(versionString_Major) + '.' + String(versionString_Minor) + '.' + String(versionString_Patch)

    return result;
}

module.exports = {
    GetVersionString
};

},{}]},{},[7,9,6,8,2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvc3BsaXQuanMvc3BsaXQuanMiLCJzcmMvY29sb3JtYXAuanMiLCJzcmMvZnVsbHNjcmVlbi5qcyIsInNyYy9nbG9iYWwuanMiLCJzcmMvaGFuZGxlcnNfbW91c2UuanMiLCJzcmMvaHRtbEZ1bmN0aW9ucy5qcyIsInNyYy9pcGNiLmpzIiwic3JjL3BjYi5qcyIsInNyYy9yZW5kZXIuanMiLCJzcmMvcmVuZGVyL3BvaW50LmpzIiwic3JjL3JlbmRlci9yZW5kZXJfYm9hcmRlZGdlLmpzIiwic3JjL3JlbmRlci9yZW5kZXJfYm91bmRpbmdib3guanMiLCJzcmMvcmVuZGVyL3JlbmRlcl9jYW52YXMuanMiLCJzcmMvcmVuZGVyL3JlbmRlcl9sb3dsZXZlbC5qcyIsInNyYy9yZW5kZXIvcmVuZGVyX3BhZC5qcyIsInNyYy9yZW5kZXIvcmVuZGVyX3NpbGtzY3JlZW4uanMiLCJzcmMvcmVuZGVyL3JlbmRlcl90cmFjZS5qcyIsInNyYy9yZW5kZXIvcmVuZGVyX3ZpYS5qcyIsInNyYy92ZXJzaW9uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsZ0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDejlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKiEgU3BsaXQuanMgLSB2MS4zLjUgKi9cblxuKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcblx0dHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnID8gbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCkgOlxuXHR0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoZmFjdG9yeSkgOlxuXHQoZ2xvYmFsLlNwbGl0ID0gZmFjdG9yeSgpKTtcbn0odGhpcywgKGZ1bmN0aW9uICgpIHsgJ3VzZSBzdHJpY3QnO1xuXG4vLyBUaGUgcHJvZ3JhbW1pbmcgZ29hbHMgb2YgU3BsaXQuanMgYXJlIHRvIGRlbGl2ZXIgcmVhZGFibGUsIHVuZGVyc3RhbmRhYmxlIGFuZFxuLy8gbWFpbnRhaW5hYmxlIGNvZGUsIHdoaWxlIGF0IHRoZSBzYW1lIHRpbWUgbWFudWFsbHkgb3B0aW1pemluZyBmb3IgdGlueSBtaW5pZmllZCBmaWxlIHNpemUsXG4vLyBicm93c2VyIGNvbXBhdGliaWxpdHkgd2l0aG91dCBhZGRpdGlvbmFsIHJlcXVpcmVtZW50cywgZ3JhY2VmdWwgZmFsbGJhY2sgKElFOCBpcyBzdXBwb3J0ZWQpXG4vLyBhbmQgdmVyeSBmZXcgYXNzdW1wdGlvbnMgYWJvdXQgdGhlIHVzZXIncyBwYWdlIGxheW91dC5cbnZhciBnbG9iYWwgPSB3aW5kb3c7XG52YXIgZG9jdW1lbnQgPSBnbG9iYWwuZG9jdW1lbnQ7XG5cbi8vIFNhdmUgYSBjb3VwbGUgbG9uZyBmdW5jdGlvbiBuYW1lcyB0aGF0IGFyZSB1c2VkIGZyZXF1ZW50bHkuXG4vLyBUaGlzIG9wdGltaXphdGlvbiBzYXZlcyBhcm91bmQgNDAwIGJ5dGVzLlxudmFyIGFkZEV2ZW50TGlzdGVuZXIgPSAnYWRkRXZlbnRMaXN0ZW5lcic7XG52YXIgcmVtb3ZlRXZlbnRMaXN0ZW5lciA9ICdyZW1vdmVFdmVudExpc3RlbmVyJztcbnZhciBnZXRCb3VuZGluZ0NsaWVudFJlY3QgPSAnZ2V0Qm91bmRpbmdDbGllbnRSZWN0JztcbnZhciBOT09QID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gZmFsc2U7IH07XG5cbi8vIEZpZ3VyZSBvdXQgaWYgd2UncmUgaW4gSUU4IG9yIG5vdC4gSUU4IHdpbGwgc3RpbGwgcmVuZGVyIGNvcnJlY3RseSxcbi8vIGJ1dCB3aWxsIGJlIHN0YXRpYyBpbnN0ZWFkIG9mIGRyYWdnYWJsZS5cbnZhciBpc0lFOCA9IGdsb2JhbC5hdHRhY2hFdmVudCAmJiAhZ2xvYmFsW2FkZEV2ZW50TGlzdGVuZXJdO1xuXG4vLyBUaGlzIGxpYnJhcnkgb25seSBuZWVkcyB0d28gaGVscGVyIGZ1bmN0aW9uczpcbi8vXG4vLyBUaGUgZmlyc3QgZGV0ZXJtaW5lcyB3aGljaCBwcmVmaXhlcyBvZiBDU1MgY2FsYyB3ZSBuZWVkLlxuLy8gV2Ugb25seSBuZWVkIHRvIGRvIHRoaXMgb25jZSBvbiBzdGFydHVwLCB3aGVuIHRoaXMgYW5vbnltb3VzIGZ1bmN0aW9uIGlzIGNhbGxlZC5cbi8vXG4vLyBUZXN0cyAtd2Via2l0LCAtbW96IGFuZCAtbyBwcmVmaXhlcy4gTW9kaWZpZWQgZnJvbSBTdGFja092ZXJmbG93OlxuLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xNjYyNTE0MC9qcy1mZWF0dXJlLWRldGVjdGlvbi10by1kZXRlY3QtdGhlLXVzYWdlLW9mLXdlYmtpdC1jYWxjLW92ZXItY2FsYy8xNjYyNTE2NyMxNjYyNTE2N1xudmFyIGNhbGMgPSAoWycnLCAnLXdlYmtpdC0nLCAnLW1vei0nLCAnLW8tJ10uZmlsdGVyKGZ1bmN0aW9uIChwcmVmaXgpIHtcbiAgICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbC5zdHlsZS5jc3NUZXh0ID0gXCJ3aWR0aDpcIiArIHByZWZpeCArIFwiY2FsYyg5cHgpXCI7XG5cbiAgICByZXR1cm4gKCEhZWwuc3R5bGUubGVuZ3RoKVxufSkuc2hpZnQoKSkgKyBcImNhbGNcIjtcblxuLy8gVGhlIHNlY29uZCBoZWxwZXIgZnVuY3Rpb24gYWxsb3dzIGVsZW1lbnRzIGFuZCBzdHJpbmcgc2VsZWN0b3JzIHRvIGJlIHVzZWRcbi8vIGludGVyY2hhbmdlYWJseS4gSW4gZWl0aGVyIGNhc2UgYW4gZWxlbWVudCBpcyByZXR1cm5lZC4gVGhpcyBhbGxvd3MgdXMgdG9cbi8vIGRvIGBTcGxpdChbZWxlbTEsIGVsZW0yXSlgIGFzIHdlbGwgYXMgYFNwbGl0KFsnI2lkMScsICcjaWQyJ10pYC5cbnZhciBlbGVtZW50T3JTZWxlY3RvciA9IGZ1bmN0aW9uIChlbCkge1xuICAgIGlmICh0eXBlb2YgZWwgPT09ICdzdHJpbmcnIHx8IGVsIGluc3RhbmNlb2YgU3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGVsKVxuICAgIH1cblxuICAgIHJldHVybiBlbFxufTtcblxuLy8gVGhlIG1haW4gZnVuY3Rpb24gdG8gaW5pdGlhbGl6ZSBhIHNwbGl0LiBTcGxpdC5qcyB0aGlua3MgYWJvdXQgZWFjaCBwYWlyXG4vLyBvZiBlbGVtZW50cyBhcyBhbiBpbmRlcGVuZGFudCBwYWlyLiBEcmFnZ2luZyB0aGUgZ3V0dGVyIGJldHdlZW4gdHdvIGVsZW1lbnRzXG4vLyBvbmx5IGNoYW5nZXMgdGhlIGRpbWVuc2lvbnMgb2YgZWxlbWVudHMgaW4gdGhhdCBwYWlyLiBUaGlzIGlzIGtleSB0byB1bmRlcnN0YW5kaW5nXG4vLyBob3cgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnMgb3BlcmF0ZSwgc2luY2UgZWFjaCBmdW5jdGlvbiBpcyBib3VuZCB0byBhIHBhaXIuXG4vL1xuLy8gQSBwYWlyIG9iamVjdCBpcyBzaGFwZWQgbGlrZSB0aGlzOlxuLy9cbi8vIHtcbi8vICAgICBhOiBET00gZWxlbWVudCxcbi8vICAgICBiOiBET00gZWxlbWVudCxcbi8vICAgICBhTWluOiBOdW1iZXIsXG4vLyAgICAgYk1pbjogTnVtYmVyLFxuLy8gICAgIGRyYWdnaW5nOiBCb29sZWFuLFxuLy8gICAgIHBhcmVudDogRE9NIGVsZW1lbnQsXG4vLyAgICAgaXNGaXJzdDogQm9vbGVhbixcbi8vICAgICBpc0xhc3Q6IEJvb2xlYW4sXG4vLyAgICAgZGlyZWN0aW9uOiAnaG9yaXpvbnRhbCcgfCAndmVydGljYWwnXG4vLyB9XG4vL1xuLy8gVGhlIGJhc2ljIHNlcXVlbmNlOlxuLy9cbi8vIDEuIFNldCBkZWZhdWx0cyB0byBzb21ldGhpbmcgc2FuZS4gYG9wdGlvbnNgIGRvZXNuJ3QgaGF2ZSB0byBiZSBwYXNzZWQgYXQgYWxsLlxuLy8gMi4gSW5pdGlhbGl6ZSBhIGJ1bmNoIG9mIHN0cmluZ3MgYmFzZWQgb24gdGhlIGRpcmVjdGlvbiB3ZSdyZSBzcGxpdHRpbmcuXG4vLyAgICBBIGxvdCBvZiB0aGUgYmVoYXZpb3IgaW4gdGhlIHJlc3Qgb2YgdGhlIGxpYnJhcnkgaXMgcGFyYW1hdGl6ZWQgZG93biB0b1xuLy8gICAgcmVseSBvbiBDU1Mgc3RyaW5ncyBhbmQgY2xhc3Nlcy5cbi8vIDMuIERlZmluZSB0aGUgZHJhZ2dpbmcgaGVscGVyIGZ1bmN0aW9ucywgYW5kIGEgZmV3IGhlbHBlcnMgdG8gZ28gd2l0aCB0aGVtLlxuLy8gNC4gTG9vcCB0aHJvdWdoIHRoZSBlbGVtZW50cyB3aGlsZSBwYWlyaW5nIHRoZW0gb2ZmLiBFdmVyeSBwYWlyIGdldHMgYW5cbi8vICAgIGBwYWlyYCBvYmplY3QsIGEgZ3V0dGVyLCBhbmQgc3BlY2lhbCBpc0ZpcnN0L2lzTGFzdCBwcm9wZXJ0aWVzLlxuLy8gNS4gQWN0dWFsbHkgc2l6ZSB0aGUgcGFpciBlbGVtZW50cywgaW5zZXJ0IGd1dHRlcnMgYW5kIGF0dGFjaCBldmVudCBsaXN0ZW5lcnMuXG52YXIgU3BsaXQgPSBmdW5jdGlvbiAoaWRzLCBvcHRpb25zKSB7XG4gICAgaWYgKCBvcHRpb25zID09PSB2b2lkIDAgKSBvcHRpb25zID0ge307XG5cbiAgICB2YXIgZGltZW5zaW9uO1xuICAgIHZhciBjbGllbnREaW1lbnNpb247XG4gICAgdmFyIGNsaWVudEF4aXM7XG4gICAgdmFyIHBvc2l0aW9uO1xuICAgIHZhciBwYWRkaW5nQTtcbiAgICB2YXIgcGFkZGluZ0I7XG4gICAgdmFyIGVsZW1lbnRzO1xuXG4gICAgLy8gQWxsIERPTSBlbGVtZW50cyBpbiB0aGUgc3BsaXQgc2hvdWxkIGhhdmUgYSBjb21tb24gcGFyZW50LiBXZSBjYW4gZ3JhYlxuICAgIC8vIHRoZSBmaXJzdCBlbGVtZW50cyBwYXJlbnQgYW5kIGhvcGUgdXNlcnMgcmVhZCB0aGUgZG9jcyBiZWNhdXNlIHRoZVxuICAgIC8vIGJlaGF2aW9yIHdpbGwgYmUgd2hhY2t5IG90aGVyd2lzZS5cbiAgICB2YXIgcGFyZW50ID0gZWxlbWVudE9yU2VsZWN0b3IoaWRzWzBdKS5wYXJlbnROb2RlO1xuICAgIHZhciBwYXJlbnRGbGV4RGlyZWN0aW9uID0gZ2xvYmFsLmdldENvbXB1dGVkU3R5bGUocGFyZW50KS5mbGV4RGlyZWN0aW9uO1xuXG4gICAgLy8gU2V0IGRlZmF1bHQgb3B0aW9ucy5zaXplcyB0byBlcXVhbCBwZXJjZW50YWdlcyBvZiB0aGUgcGFyZW50IGVsZW1lbnQuXG4gICAgdmFyIHNpemVzID0gb3B0aW9ucy5zaXplcyB8fCBpZHMubWFwKGZ1bmN0aW9uICgpIHsgcmV0dXJuIDEwMCAvIGlkcy5sZW5ndGg7IH0pO1xuXG4gICAgLy8gU3RhbmRhcmRpemUgbWluU2l6ZSB0byBhbiBhcnJheSBpZiBpdCBpc24ndCBhbHJlYWR5LiBUaGlzIGFsbG93cyBtaW5TaXplXG4gICAgLy8gdG8gYmUgcGFzc2VkIGFzIGEgbnVtYmVyLlxuICAgIHZhciBtaW5TaXplID0gb3B0aW9ucy5taW5TaXplICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLm1pblNpemUgOiAxMDA7XG4gICAgdmFyIG1pblNpemVzID0gQXJyYXkuaXNBcnJheShtaW5TaXplKSA/IG1pblNpemUgOiBpZHMubWFwKGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1pblNpemU7IH0pO1xuICAgIHZhciBndXR0ZXJTaXplID0gb3B0aW9ucy5ndXR0ZXJTaXplICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmd1dHRlclNpemUgOiAxMDtcbiAgICB2YXIgc25hcE9mZnNldCA9IG9wdGlvbnMuc25hcE9mZnNldCAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5zbmFwT2Zmc2V0IDogMzA7XG4gICAgdmFyIGRpcmVjdGlvbiA9IG9wdGlvbnMuZGlyZWN0aW9uIHx8ICdob3Jpem9udGFsJztcbiAgICB2YXIgY3Vyc29yID0gb3B0aW9ucy5jdXJzb3IgfHwgKGRpcmVjdGlvbiA9PT0gJ2hvcml6b250YWwnID8gJ2V3LXJlc2l6ZScgOiAnbnMtcmVzaXplJyk7XG4gICAgdmFyIGd1dHRlciA9IG9wdGlvbnMuZ3V0dGVyIHx8IChmdW5jdGlvbiAoaSwgZ3V0dGVyRGlyZWN0aW9uKSB7XG4gICAgICAgIHZhciBndXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgZ3V0LmNsYXNzTmFtZSA9IFwiZ3V0dGVyIGd1dHRlci1cIiArIGd1dHRlckRpcmVjdGlvbjtcbiAgICAgICAgcmV0dXJuIGd1dFxuICAgIH0pO1xuICAgIHZhciBlbGVtZW50U3R5bGUgPSBvcHRpb25zLmVsZW1lbnRTdHlsZSB8fCAoZnVuY3Rpb24gKGRpbSwgc2l6ZSwgZ3V0U2l6ZSkge1xuICAgICAgICB2YXIgc3R5bGUgPSB7fTtcblxuICAgICAgICBpZiAodHlwZW9mIHNpemUgIT09ICdzdHJpbmcnICYmICEoc2l6ZSBpbnN0YW5jZW9mIFN0cmluZykpIHtcbiAgICAgICAgICAgIGlmICghaXNJRTgpIHtcbiAgICAgICAgICAgICAgICBzdHlsZVtkaW1dID0gY2FsYyArIFwiKFwiICsgc2l6ZSArIFwiJSAtIFwiICsgZ3V0U2l6ZSArIFwicHgpXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0eWxlW2RpbV0gPSBzaXplICsgXCIlXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdHlsZVtkaW1dID0gc2l6ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdHlsZVxuICAgIH0pO1xuICAgIHZhciBndXR0ZXJTdHlsZSA9IG9wdGlvbnMuZ3V0dGVyU3R5bGUgfHwgKGZ1bmN0aW9uIChkaW0sIGd1dFNpemUpIHsgcmV0dXJuICgoIG9iaiA9IHt9LCBvYmpbZGltXSA9IChndXRTaXplICsgXCJweFwiKSwgb2JqICkpXG4gICAgICAgIHZhciBvYmo7IH0pO1xuXG4gICAgLy8gMi4gSW5pdGlhbGl6ZSBhIGJ1bmNoIG9mIHN0cmluZ3MgYmFzZWQgb24gdGhlIGRpcmVjdGlvbiB3ZSdyZSBzcGxpdHRpbmcuXG4gICAgLy8gQSBsb3Qgb2YgdGhlIGJlaGF2aW9yIGluIHRoZSByZXN0IG9mIHRoZSBsaWJyYXJ5IGlzIHBhcmFtYXRpemVkIGRvd24gdG9cbiAgICAvLyByZWx5IG9uIENTUyBzdHJpbmdzIGFuZCBjbGFzc2VzLlxuICAgIGlmIChkaXJlY3Rpb24gPT09ICdob3Jpem9udGFsJykge1xuICAgICAgICBkaW1lbnNpb24gPSAnd2lkdGgnO1xuICAgICAgICBjbGllbnREaW1lbnNpb24gPSAnY2xpZW50V2lkdGgnO1xuICAgICAgICBjbGllbnRBeGlzID0gJ2NsaWVudFgnO1xuICAgICAgICBwb3NpdGlvbiA9ICdsZWZ0JztcbiAgICAgICAgcGFkZGluZ0EgPSAncGFkZGluZ0xlZnQnO1xuICAgICAgICBwYWRkaW5nQiA9ICdwYWRkaW5nUmlnaHQnO1xuICAgIH0gZWxzZSBpZiAoZGlyZWN0aW9uID09PSAndmVydGljYWwnKSB7XG4gICAgICAgIGRpbWVuc2lvbiA9ICdoZWlnaHQnO1xuICAgICAgICBjbGllbnREaW1lbnNpb24gPSAnY2xpZW50SGVpZ2h0JztcbiAgICAgICAgY2xpZW50QXhpcyA9ICdjbGllbnRZJztcbiAgICAgICAgcG9zaXRpb24gPSAndG9wJztcbiAgICAgICAgcGFkZGluZ0EgPSAncGFkZGluZ1RvcCc7XG4gICAgICAgIHBhZGRpbmdCID0gJ3BhZGRpbmdCb3R0b20nO1xuICAgIH1cblxuICAgIC8vIDMuIERlZmluZSB0aGUgZHJhZ2dpbmcgaGVscGVyIGZ1bmN0aW9ucywgYW5kIGEgZmV3IGhlbHBlcnMgdG8gZ28gd2l0aCB0aGVtLlxuICAgIC8vIEVhY2ggaGVscGVyIGlzIGJvdW5kIHRvIGEgcGFpciBvYmplY3QgdGhhdCBjb250YWlucyBpdCdzIG1ldGFkYXRhLiBUaGlzXG4gICAgLy8gYWxzbyBtYWtlcyBpdCBlYXN5IHRvIHN0b3JlIHJlZmVyZW5jZXMgdG8gbGlzdGVuZXJzIHRoYXQgdGhhdCB3aWxsIGJlXG4gICAgLy8gYWRkZWQgYW5kIHJlbW92ZWQuXG4gICAgLy9cbiAgICAvLyBFdmVuIHRob3VnaCB0aGVyZSBhcmUgbm8gb3RoZXIgZnVuY3Rpb25zIGNvbnRhaW5lZCBpbiB0aGVtLCBhbGlhc2luZ1xuICAgIC8vIHRoaXMgdG8gc2VsZiBzYXZlcyA1MCBieXRlcyBvciBzbyBzaW5jZSBpdCdzIHVzZWQgc28gZnJlcXVlbnRseS5cbiAgICAvL1xuICAgIC8vIFRoZSBwYWlyIG9iamVjdCBzYXZlcyBtZXRhZGF0YSBsaWtlIGRyYWdnaW5nIHN0YXRlLCBwb3NpdGlvbiBhbmRcbiAgICAvLyBldmVudCBsaXN0ZW5lciByZWZlcmVuY2VzLlxuXG4gICAgZnVuY3Rpb24gc2V0RWxlbWVudFNpemUgKGVsLCBzaXplLCBndXRTaXplKSB7XG4gICAgICAgIC8vIFNwbGl0LmpzIGFsbG93cyBzZXR0aW5nIHNpemVzIHZpYSBudW1iZXJzIChpZGVhbGx5KSwgb3IgaWYgeW91IG11c3QsXG4gICAgICAgIC8vIGJ5IHN0cmluZywgbGlrZSAnMzAwcHgnLiBUaGlzIGlzIGxlc3MgdGhhbiBpZGVhbCwgYmVjYXVzZSBpdCBicmVha3NcbiAgICAgICAgLy8gdGhlIGZsdWlkIGxheW91dCB0aGF0IGBjYWxjKCUgLSBweClgIHByb3ZpZGVzLiBZb3UncmUgb24geW91ciBvd24gaWYgeW91IGRvIHRoYXQsXG4gICAgICAgIC8vIG1ha2Ugc3VyZSB5b3UgY2FsY3VsYXRlIHRoZSBndXR0ZXIgc2l6ZSBieSBoYW5kLlxuICAgICAgICB2YXIgc3R5bGUgPSBlbGVtZW50U3R5bGUoZGltZW5zaW9uLCBzaXplLCBndXRTaXplKTtcblxuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcGFyYW0tcmVhc3NpZ25cbiAgICAgICAgT2JqZWN0LmtleXMoc3R5bGUpLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHsgcmV0dXJuIChlbC5zdHlsZVtwcm9wXSA9IHN0eWxlW3Byb3BdKTsgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0R3V0dGVyU2l6ZSAoZ3V0dGVyRWxlbWVudCwgZ3V0U2l6ZSkge1xuICAgICAgICB2YXIgc3R5bGUgPSBndXR0ZXJTdHlsZShkaW1lbnNpb24sIGd1dFNpemUpO1xuXG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1wYXJhbS1yZWFzc2lnblxuICAgICAgICBPYmplY3Qua2V5cyhzdHlsZSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkgeyByZXR1cm4gKGd1dHRlckVsZW1lbnQuc3R5bGVbcHJvcF0gPSBzdHlsZVtwcm9wXSk7IH0pO1xuICAgIH1cblxuICAgIC8vIEFjdHVhbGx5IGFkanVzdCB0aGUgc2l6ZSBvZiBlbGVtZW50cyBgYWAgYW5kIGBiYCB0byBgb2Zmc2V0YCB3aGlsZSBkcmFnZ2luZy5cbiAgICAvLyBjYWxjIGlzIHVzZWQgdG8gYWxsb3cgY2FsYyhwZXJjZW50YWdlICsgZ3V0dGVycHgpIG9uIHRoZSB3aG9sZSBzcGxpdCBpbnN0YW5jZSxcbiAgICAvLyB3aGljaCBhbGxvd3MgdGhlIHZpZXdwb3J0IHRvIGJlIHJlc2l6ZWQgd2l0aG91dCBhZGRpdGlvbmFsIGxvZ2ljLlxuICAgIC8vIEVsZW1lbnQgYSdzIHNpemUgaXMgdGhlIHNhbWUgYXMgb2Zmc2V0LiBiJ3Mgc2l6ZSBpcyB0b3RhbCBzaXplIC0gYSBzaXplLlxuICAgIC8vIEJvdGggc2l6ZXMgYXJlIGNhbGN1bGF0ZWQgZnJvbSB0aGUgaW5pdGlhbCBwYXJlbnQgcGVyY2VudGFnZSxcbiAgICAvLyB0aGVuIHRoZSBndXR0ZXIgc2l6ZSBpcyBzdWJ0cmFjdGVkLlxuICAgIGZ1bmN0aW9uIGFkanVzdCAob2Zmc2V0KSB7XG4gICAgICAgIHZhciBhID0gZWxlbWVudHNbdGhpcy5hXTtcbiAgICAgICAgdmFyIGIgPSBlbGVtZW50c1t0aGlzLmJdO1xuICAgICAgICB2YXIgcGVyY2VudGFnZSA9IGEuc2l6ZSArIGIuc2l6ZTtcblxuICAgICAgICBhLnNpemUgPSAob2Zmc2V0IC8gdGhpcy5zaXplKSAqIHBlcmNlbnRhZ2U7XG4gICAgICAgIGIuc2l6ZSA9IChwZXJjZW50YWdlIC0gKChvZmZzZXQgLyB0aGlzLnNpemUpICogcGVyY2VudGFnZSkpO1xuXG4gICAgICAgIHNldEVsZW1lbnRTaXplKGEuZWxlbWVudCwgYS5zaXplLCB0aGlzLmFHdXR0ZXJTaXplKTtcbiAgICAgICAgc2V0RWxlbWVudFNpemUoYi5lbGVtZW50LCBiLnNpemUsIHRoaXMuYkd1dHRlclNpemUpO1xuICAgIH1cblxuICAgIC8vIGRyYWcsIHdoZXJlIGFsbCB0aGUgbWFnaWMgaGFwcGVucy4gVGhlIGxvZ2ljIGlzIHJlYWxseSBxdWl0ZSBzaW1wbGU6XG4gICAgLy9cbiAgICAvLyAxLiBJZ25vcmUgaWYgdGhlIHBhaXIgaXMgbm90IGRyYWdnaW5nLlxuICAgIC8vIDIuIEdldCB0aGUgb2Zmc2V0IG9mIHRoZSBldmVudC5cbiAgICAvLyAzLiBTbmFwIG9mZnNldCB0byBtaW4gaWYgd2l0aGluIHNuYXBwYWJsZSByYW5nZSAod2l0aGluIG1pbiArIHNuYXBPZmZzZXQpLlxuICAgIC8vIDQuIEFjdHVhbGx5IGFkanVzdCBlYWNoIGVsZW1lbnQgaW4gdGhlIHBhaXIgdG8gb2Zmc2V0LlxuICAgIC8vXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gfCAgICB8IDwtIGEubWluU2l6ZSAgICAgICAgICAgICAgIHx8ICAgICAgICAgICAgICBiLm1pblNpemUgLT4gfCAgICB8XG4gICAgLy8gfCAgICB8ICB8IDwtIHRoaXMuc25hcE9mZnNldCAgICAgIHx8ICAgICB0aGlzLnNuYXBPZmZzZXQgLT4gfCAgfCAgICB8XG4gICAgLy8gfCAgICB8ICB8ICAgICAgICAgICAgICAgICAgICAgICAgIHx8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgfCAgICB8XG4gICAgLy8gfCAgICB8ICB8ICAgICAgICAgICAgICAgICAgICAgICAgIHx8ICAgICAgICAgICAgICAgICAgICAgICAgfCAgfCAgICB8XG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gfCA8LSB0aGlzLnN0YXJ0ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2l6ZSAtPiB8XG4gICAgZnVuY3Rpb24gZHJhZyAoZSkge1xuICAgICAgICB2YXIgb2Zmc2V0O1xuXG4gICAgICAgIGlmICghdGhpcy5kcmFnZ2luZykgeyByZXR1cm4gfVxuXG4gICAgICAgIC8vIEdldCB0aGUgb2Zmc2V0IG9mIHRoZSBldmVudCBmcm9tIHRoZSBmaXJzdCBzaWRlIG9mIHRoZVxuICAgICAgICAvLyBwYWlyIGB0aGlzLnN0YXJ0YC4gU3VwcG9ydHMgdG91Y2ggZXZlbnRzLCBidXQgbm90IG11bHRpdG91Y2gsIHNvIG9ubHkgdGhlIGZpcnN0XG4gICAgICAgIC8vIGZpbmdlciBgdG91Y2hlc1swXWAgaXMgY291bnRlZC5cbiAgICAgICAgaWYgKCd0b3VjaGVzJyBpbiBlKSB7XG4gICAgICAgICAgICBvZmZzZXQgPSBlLnRvdWNoZXNbMF1bY2xpZW50QXhpc10gLSB0aGlzLnN0YXJ0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb2Zmc2V0ID0gZVtjbGllbnRBeGlzXSAtIHRoaXMuc3RhcnQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3aXRoaW4gc25hcE9mZnNldCBvZiBtaW4gb3IgbWF4LCBzZXQgb2Zmc2V0IHRvIG1pbiBvciBtYXguXG4gICAgICAgIC8vIHNuYXBPZmZzZXQgYnVmZmVycyBhLm1pblNpemUgYW5kIGIubWluU2l6ZSwgc28gbG9naWMgaXMgb3Bwb3NpdGUgZm9yIGJvdGguXG4gICAgICAgIC8vIEluY2x1ZGUgdGhlIGFwcHJvcHJpYXRlIGd1dHRlciBzaXplcyB0byBwcmV2ZW50IG92ZXJmbG93cy5cbiAgICAgICAgaWYgKG9mZnNldCA8PSBlbGVtZW50c1t0aGlzLmFdLm1pblNpemUgKyBzbmFwT2Zmc2V0ICsgdGhpcy5hR3V0dGVyU2l6ZSkge1xuICAgICAgICAgICAgb2Zmc2V0ID0gZWxlbWVudHNbdGhpcy5hXS5taW5TaXplICsgdGhpcy5hR3V0dGVyU2l6ZTtcbiAgICAgICAgfSBlbHNlIGlmIChvZmZzZXQgPj0gdGhpcy5zaXplIC0gKGVsZW1lbnRzW3RoaXMuYl0ubWluU2l6ZSArIHNuYXBPZmZzZXQgKyB0aGlzLmJHdXR0ZXJTaXplKSkge1xuICAgICAgICAgICAgb2Zmc2V0ID0gdGhpcy5zaXplIC0gKGVsZW1lbnRzW3RoaXMuYl0ubWluU2l6ZSArIHRoaXMuYkd1dHRlclNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWN0dWFsbHkgYWRqdXN0IHRoZSBzaXplLlxuICAgICAgICBhZGp1c3QuY2FsbCh0aGlzLCBvZmZzZXQpO1xuXG4gICAgICAgIC8vIENhbGwgdGhlIGRyYWcgY2FsbGJhY2sgY29udGlub3VzbHkuIERvbid0IGRvIGFueXRoaW5nIHRvbyBpbnRlbnNpdmVcbiAgICAgICAgLy8gaW4gdGhpcyBjYWxsYmFjay5cbiAgICAgICAgaWYgKG9wdGlvbnMub25EcmFnKSB7XG4gICAgICAgICAgICBvcHRpb25zLm9uRHJhZygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2FjaGUgc29tZSBpbXBvcnRhbnQgc2l6ZXMgd2hlbiBkcmFnIHN0YXJ0cywgc28gd2UgZG9uJ3QgaGF2ZSB0byBkbyB0aGF0XG4gICAgLy8gY29udGlub3VzbHk6XG4gICAgLy9cbiAgICAvLyBgc2l6ZWA6IFRoZSB0b3RhbCBzaXplIG9mIHRoZSBwYWlyLiBGaXJzdCArIHNlY29uZCArIGZpcnN0IGd1dHRlciArIHNlY29uZCBndXR0ZXIuXG4gICAgLy8gYHN0YXJ0YDogVGhlIGxlYWRpbmcgc2lkZSBvZiB0aGUgZmlyc3QgZWxlbWVudC5cbiAgICAvL1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHwgICAgICBhR3V0dGVyU2l6ZSAtPiB8fHwgICAgICAgICAgICAgICAgICAgICAgfFxuICAgIC8vIHwgICAgICAgICAgICAgICAgICAgICB8fHwgICAgICAgICAgICAgICAgICAgICAgfFxuICAgIC8vIHwgICAgICAgICAgICAgICAgICAgICB8fHwgICAgICAgICAgICAgICAgICAgICAgfFxuICAgIC8vIHwgICAgICAgICAgICAgICAgICAgICB8fHwgPC0gYkd1dHRlclNpemUgICAgICAgfFxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIHwgPC0gc3RhcnQgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNpemUgLT4gfFxuICAgIGZ1bmN0aW9uIGNhbGN1bGF0ZVNpemVzICgpIHtcbiAgICAgICAgLy8gRmlndXJlIG91dCB0aGUgcGFyZW50IHNpemUgbWludXMgcGFkZGluZy5cbiAgICAgICAgdmFyIGEgPSBlbGVtZW50c1t0aGlzLmFdLmVsZW1lbnQ7XG4gICAgICAgIHZhciBiID0gZWxlbWVudHNbdGhpcy5iXS5lbGVtZW50O1xuXG4gICAgICAgIHRoaXMuc2l6ZSA9IGFbZ2V0Qm91bmRpbmdDbGllbnRSZWN0XSgpW2RpbWVuc2lvbl0gKyBiW2dldEJvdW5kaW5nQ2xpZW50UmVjdF0oKVtkaW1lbnNpb25dICsgdGhpcy5hR3V0dGVyU2l6ZSArIHRoaXMuYkd1dHRlclNpemU7XG4gICAgICAgIHRoaXMuc3RhcnQgPSBhW2dldEJvdW5kaW5nQ2xpZW50UmVjdF0oKVtwb3NpdGlvbl07XG4gICAgfVxuXG4gICAgLy8gc3RvcERyYWdnaW5nIGlzIHZlcnkgc2ltaWxhciB0byBzdGFydERyYWdnaW5nIGluIHJldmVyc2UuXG4gICAgZnVuY3Rpb24gc3RvcERyYWdnaW5nICgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgYSA9IGVsZW1lbnRzW3NlbGYuYV0uZWxlbWVudDtcbiAgICAgICAgdmFyIGIgPSBlbGVtZW50c1tzZWxmLmJdLmVsZW1lbnQ7XG5cbiAgICAgICAgaWYgKHNlbGYuZHJhZ2dpbmcgJiYgb3B0aW9ucy5vbkRyYWdFbmQpIHtcbiAgICAgICAgICAgIG9wdGlvbnMub25EcmFnRW5kKCk7XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLmRyYWdnaW5nID0gZmFsc2U7XG5cbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBzdG9yZWQgZXZlbnQgbGlzdGVuZXJzLiBUaGlzIGlzIHdoeSB3ZSBzdG9yZSB0aGVtLlxuICAgICAgICBnbG9iYWxbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ21vdXNldXAnLCBzZWxmLnN0b3ApO1xuICAgICAgICBnbG9iYWxbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ3RvdWNoZW5kJywgc2VsZi5zdG9wKTtcbiAgICAgICAgZ2xvYmFsW3JlbW92ZUV2ZW50TGlzdGVuZXJdKCd0b3VjaGNhbmNlbCcsIHNlbGYuc3RvcCk7XG5cbiAgICAgICAgc2VsZi5wYXJlbnRbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ21vdXNlbW92ZScsIHNlbGYubW92ZSk7XG4gICAgICAgIHNlbGYucGFyZW50W3JlbW92ZUV2ZW50TGlzdGVuZXJdKCd0b3VjaG1vdmUnLCBzZWxmLm1vdmUpO1xuXG4gICAgICAgIC8vIERlbGV0ZSB0aGVtIG9uY2UgdGhleSBhcmUgcmVtb3ZlZC4gSSB0aGluayB0aGlzIG1ha2VzIGEgZGlmZmVyZW5jZVxuICAgICAgICAvLyBpbiBtZW1vcnkgdXNhZ2Ugd2l0aCBhIGxvdCBvZiBzcGxpdHMgb24gb25lIHBhZ2UuIEJ1dCBJIGRvbid0IGtub3cgZm9yIHN1cmUuXG4gICAgICAgIGRlbGV0ZSBzZWxmLnN0b3A7XG4gICAgICAgIGRlbGV0ZSBzZWxmLm1vdmU7XG5cbiAgICAgICAgYVtyZW1vdmVFdmVudExpc3RlbmVyXSgnc2VsZWN0c3RhcnQnLCBOT09QKTtcbiAgICAgICAgYVtyZW1vdmVFdmVudExpc3RlbmVyXSgnZHJhZ3N0YXJ0JywgTk9PUCk7XG4gICAgICAgIGJbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ3NlbGVjdHN0YXJ0JywgTk9PUCk7XG4gICAgICAgIGJbcmVtb3ZlRXZlbnRMaXN0ZW5lcl0oJ2RyYWdzdGFydCcsIE5PT1ApO1xuXG4gICAgICAgIGEuc3R5bGUudXNlclNlbGVjdCA9ICcnO1xuICAgICAgICBhLnN0eWxlLndlYmtpdFVzZXJTZWxlY3QgPSAnJztcbiAgICAgICAgYS5zdHlsZS5Nb3pVc2VyU2VsZWN0ID0gJyc7XG4gICAgICAgIGEuc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnO1xuXG4gICAgICAgIGIuc3R5bGUudXNlclNlbGVjdCA9ICcnO1xuICAgICAgICBiLnN0eWxlLndlYmtpdFVzZXJTZWxlY3QgPSAnJztcbiAgICAgICAgYi5zdHlsZS5Nb3pVc2VyU2VsZWN0ID0gJyc7XG4gICAgICAgIGIuc3R5bGUucG9pbnRlckV2ZW50cyA9ICcnO1xuXG4gICAgICAgIHNlbGYuZ3V0dGVyLnN0eWxlLmN1cnNvciA9ICcnO1xuICAgICAgICBzZWxmLnBhcmVudC5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICB9XG5cbiAgICAvLyBzdGFydERyYWdnaW5nIGNhbGxzIGBjYWxjdWxhdGVTaXplc2AgdG8gc3RvcmUgdGhlIGluaXRhbCBzaXplIGluIHRoZSBwYWlyIG9iamVjdC5cbiAgICAvLyBJdCBhbHNvIGFkZHMgZXZlbnQgbGlzdGVuZXJzIGZvciBtb3VzZS90b3VjaCBldmVudHMsXG4gICAgLy8gYW5kIHByZXZlbnRzIHNlbGVjdGlvbiB3aGlsZSBkcmFnZ2luZyBzbyBhdm9pZCB0aGUgc2VsZWN0aW5nIHRleHQuXG4gICAgZnVuY3Rpb24gc3RhcnREcmFnZ2luZyAoZSkge1xuICAgICAgICAvLyBBbGlhcyBmcmVxdWVudGx5IHVzZWQgdmFyaWFibGVzIHRvIHNhdmUgc3BhY2UuIDIwMCBieXRlcy5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgYSA9IGVsZW1lbnRzW3NlbGYuYV0uZWxlbWVudDtcbiAgICAgICAgdmFyIGIgPSBlbGVtZW50c1tzZWxmLmJdLmVsZW1lbnQ7XG5cbiAgICAgICAgLy8gQ2FsbCB0aGUgb25EcmFnU3RhcnQgY2FsbGJhY2suXG4gICAgICAgIGlmICghc2VsZi5kcmFnZ2luZyAmJiBvcHRpb25zLm9uRHJhZ1N0YXJ0KSB7XG4gICAgICAgICAgICBvcHRpb25zLm9uRHJhZ1N0YXJ0KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEb24ndCBhY3R1YWxseSBkcmFnIHRoZSBlbGVtZW50LiBXZSBlbXVsYXRlIHRoYXQgaW4gdGhlIGRyYWcgZnVuY3Rpb24uXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICAvLyBTZXQgdGhlIGRyYWdnaW5nIHByb3BlcnR5IG9mIHRoZSBwYWlyIG9iamVjdC5cbiAgICAgICAgc2VsZi5kcmFnZ2luZyA9IHRydWU7XG5cbiAgICAgICAgLy8gQ3JlYXRlIHR3byBldmVudCBsaXN0ZW5lcnMgYm91bmQgdG8gdGhlIHNhbWUgcGFpciBvYmplY3QgYW5kIHN0b3JlXG4gICAgICAgIC8vIHRoZW0gaW4gdGhlIHBhaXIgb2JqZWN0LlxuICAgICAgICBzZWxmLm1vdmUgPSBkcmFnLmJpbmQoc2VsZik7XG4gICAgICAgIHNlbGYuc3RvcCA9IHN0b3BEcmFnZ2luZy5iaW5kKHNlbGYpO1xuXG4gICAgICAgIC8vIEFsbCB0aGUgYmluZGluZy4gYHdpbmRvd2AgZ2V0cyB0aGUgc3RvcCBldmVudHMgaW4gY2FzZSB3ZSBkcmFnIG91dCBvZiB0aGUgZWxlbWVudHMuXG4gICAgICAgIGdsb2JhbFthZGRFdmVudExpc3RlbmVyXSgnbW91c2V1cCcsIHNlbGYuc3RvcCk7XG4gICAgICAgIGdsb2JhbFthZGRFdmVudExpc3RlbmVyXSgndG91Y2hlbmQnLCBzZWxmLnN0b3ApO1xuICAgICAgICBnbG9iYWxbYWRkRXZlbnRMaXN0ZW5lcl0oJ3RvdWNoY2FuY2VsJywgc2VsZi5zdG9wKTtcblxuICAgICAgICBzZWxmLnBhcmVudFthZGRFdmVudExpc3RlbmVyXSgnbW91c2Vtb3ZlJywgc2VsZi5tb3ZlKTtcbiAgICAgICAgc2VsZi5wYXJlbnRbYWRkRXZlbnRMaXN0ZW5lcl0oJ3RvdWNobW92ZScsIHNlbGYubW92ZSk7XG5cbiAgICAgICAgLy8gRGlzYWJsZSBzZWxlY3Rpb24uIERpc2FibGUhXG4gICAgICAgIGFbYWRkRXZlbnRMaXN0ZW5lcl0oJ3NlbGVjdHN0YXJ0JywgTk9PUCk7XG4gICAgICAgIGFbYWRkRXZlbnRMaXN0ZW5lcl0oJ2RyYWdzdGFydCcsIE5PT1ApO1xuICAgICAgICBiW2FkZEV2ZW50TGlzdGVuZXJdKCdzZWxlY3RzdGFydCcsIE5PT1ApO1xuICAgICAgICBiW2FkZEV2ZW50TGlzdGVuZXJdKCdkcmFnc3RhcnQnLCBOT09QKTtcblxuICAgICAgICBhLnN0eWxlLnVzZXJTZWxlY3QgPSAnbm9uZSc7XG4gICAgICAgIGEuc3R5bGUud2Via2l0VXNlclNlbGVjdCA9ICdub25lJztcbiAgICAgICAgYS5zdHlsZS5Nb3pVc2VyU2VsZWN0ID0gJ25vbmUnO1xuICAgICAgICBhLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG5cbiAgICAgICAgYi5zdHlsZS51c2VyU2VsZWN0ID0gJ25vbmUnO1xuICAgICAgICBiLnN0eWxlLndlYmtpdFVzZXJTZWxlY3QgPSAnbm9uZSc7XG4gICAgICAgIGIuc3R5bGUuTW96VXNlclNlbGVjdCA9ICdub25lJztcbiAgICAgICAgYi5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXG4gICAgICAgIC8vIFNldCB0aGUgY3Vyc29yLCBib3RoIG9uIHRoZSBndXR0ZXIgYW5kIHRoZSBwYXJlbnQgZWxlbWVudC5cbiAgICAgICAgLy8gRG9pbmcgb25seSBhLCBiIGFuZCBndXR0ZXIgY2F1c2VzIGZsaWNrZXJpbmcuXG4gICAgICAgIHNlbGYuZ3V0dGVyLnN0eWxlLmN1cnNvciA9IGN1cnNvcjtcbiAgICAgICAgc2VsZi5wYXJlbnQuc3R5bGUuY3Vyc29yID0gY3Vyc29yO1xuXG4gICAgICAgIC8vIENhY2hlIHRoZSBpbml0aWFsIHNpemVzIG9mIHRoZSBwYWlyLlxuICAgICAgICBjYWxjdWxhdGVTaXplcy5jYWxsKHNlbGYpO1xuICAgIH1cblxuICAgIC8vIDUuIENyZWF0ZSBwYWlyIGFuZCBlbGVtZW50IG9iamVjdHMuIEVhY2ggcGFpciBoYXMgYW4gaW5kZXggcmVmZXJlbmNlIHRvXG4gICAgLy8gZWxlbWVudHMgYGFgIGFuZCBgYmAgb2YgdGhlIHBhaXIgKGZpcnN0IGFuZCBzZWNvbmQgZWxlbWVudHMpLlxuICAgIC8vIExvb3AgdGhyb3VnaCB0aGUgZWxlbWVudHMgd2hpbGUgcGFpcmluZyB0aGVtIG9mZi4gRXZlcnkgcGFpciBnZXRzIGFcbiAgICAvLyBgcGFpcmAgb2JqZWN0LCBhIGd1dHRlciwgYW5kIGlzRmlyc3QvaXNMYXN0IHByb3BlcnRpZXMuXG4gICAgLy9cbiAgICAvLyBCYXNpYyBsb2dpYzpcbiAgICAvL1xuICAgIC8vIC0gU3RhcnRpbmcgd2l0aCB0aGUgc2Vjb25kIGVsZW1lbnQgYGkgPiAwYCwgY3JlYXRlIGBwYWlyYCBvYmplY3RzIHdpdGhcbiAgICAvLyAgIGBhID0gaSAtIDFgIGFuZCBgYiA9IGlgXG4gICAgLy8gLSBTZXQgZ3V0dGVyIHNpemVzIGJhc2VkIG9uIHRoZSBfcGFpcl8gYmVpbmcgZmlyc3QvbGFzdC4gVGhlIGZpcnN0IGFuZCBsYXN0XG4gICAgLy8gICBwYWlyIGhhdmUgZ3V0dGVyU2l6ZSAvIDIsIHNpbmNlIHRoZXkgb25seSBoYXZlIG9uZSBoYWxmIGd1dHRlciwgYW5kIG5vdCB0d28uXG4gICAgLy8gLSBDcmVhdGUgZ3V0dGVyIGVsZW1lbnRzIGFuZCBhZGQgZXZlbnQgbGlzdGVuZXJzLlxuICAgIC8vIC0gU2V0IHRoZSBzaXplIG9mIHRoZSBlbGVtZW50cywgbWludXMgdGhlIGd1dHRlciBzaXplcy5cbiAgICAvL1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gfCAgICAgaT0wICAgICB8ICAgICAgICAgaT0xICAgICAgICAgfCAgICAgICAgaT0yICAgICAgIHwgICAgICBpPTMgICAgIHxcbiAgICAvLyB8ICAgICAgICAgICAgIHwgICAgICAgaXNGaXJzdCAgICAgICB8ICAgICAgICAgICAgICAgICAgfCAgICAgaXNMYXN0ICAgfFxuICAgIC8vIHwgICAgICAgICAgIHBhaXIgMCAgICAgICAgICAgICAgICBwYWlyIDEgICAgICAgICAgICAgcGFpciAyICAgICAgICAgICB8XG4gICAgLy8gfCAgICAgICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgfCAgICAgICAgICAgICAgICAgIHwgICAgICAgICAgICAgIHxcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIHZhciBwYWlycyA9IFtdO1xuICAgIGVsZW1lbnRzID0gaWRzLm1hcChmdW5jdGlvbiAoaWQsIGkpIHtcbiAgICAgICAgLy8gQ3JlYXRlIHRoZSBlbGVtZW50IG9iamVjdC5cbiAgICAgICAgdmFyIGVsZW1lbnQgPSB7XG4gICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50T3JTZWxlY3RvcihpZCksXG4gICAgICAgICAgICBzaXplOiBzaXplc1tpXSxcbiAgICAgICAgICAgIG1pblNpemU6IG1pblNpemVzW2ldLFxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBwYWlyO1xuXG4gICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgLy8gQ3JlYXRlIHRoZSBwYWlyIG9iamVjdCB3aXRoIGl0J3MgbWV0YWRhdGEuXG4gICAgICAgICAgICBwYWlyID0ge1xuICAgICAgICAgICAgICAgIGE6IGkgLSAxLFxuICAgICAgICAgICAgICAgIGI6IGksXG4gICAgICAgICAgICAgICAgZHJhZ2dpbmc6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGlzRmlyc3Q6IChpID09PSAxKSxcbiAgICAgICAgICAgICAgICBpc0xhc3Q6IChpID09PSBpZHMubGVuZ3RoIC0gMSksXG4gICAgICAgICAgICAgICAgZGlyZWN0aW9uOiBkaXJlY3Rpb24sXG4gICAgICAgICAgICAgICAgcGFyZW50OiBwYXJlbnQsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBGb3IgZmlyc3QgYW5kIGxhc3QgcGFpcnMsIGZpcnN0IGFuZCBsYXN0IGd1dHRlciB3aWR0aCBpcyBoYWxmLlxuICAgICAgICAgICAgcGFpci5hR3V0dGVyU2l6ZSA9IGd1dHRlclNpemU7XG4gICAgICAgICAgICBwYWlyLmJHdXR0ZXJTaXplID0gZ3V0dGVyU2l6ZTtcblxuICAgICAgICAgICAgaWYgKHBhaXIuaXNGaXJzdCkge1xuICAgICAgICAgICAgICAgIHBhaXIuYUd1dHRlclNpemUgPSBndXR0ZXJTaXplIC8gMjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHBhaXIuaXNMYXN0KSB7XG4gICAgICAgICAgICAgICAgcGFpci5iR3V0dGVyU2l6ZSA9IGd1dHRlclNpemUgLyAyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiB0aGUgcGFyZW50IGhhcyBhIHJldmVyc2UgZmxleC1kaXJlY3Rpb24sIHN3aXRjaCB0aGUgcGFpciBlbGVtZW50cy5cbiAgICAgICAgICAgIGlmIChwYXJlbnRGbGV4RGlyZWN0aW9uID09PSAncm93LXJldmVyc2UnIHx8IHBhcmVudEZsZXhEaXJlY3Rpb24gPT09ICdjb2x1bW4tcmV2ZXJzZScpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGVtcCA9IHBhaXIuYTtcbiAgICAgICAgICAgICAgICBwYWlyLmEgPSBwYWlyLmI7XG4gICAgICAgICAgICAgICAgcGFpci5iID0gdGVtcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSB0aGUgc2l6ZSBvZiB0aGUgY3VycmVudCBlbGVtZW50LiBJRTggaXMgc3VwcG9ydGVkIGJ5XG4gICAgICAgIC8vIHN0YXRpY2x5IGFzc2lnbmluZyBzaXplcyB3aXRob3V0IGRyYWdnYWJsZSBndXR0ZXJzLiBBc3NpZ25zIGEgc3RyaW5nXG4gICAgICAgIC8vIHRvIGBzaXplYC5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gSUU5IGFuZCBhYm92ZVxuICAgICAgICBpZiAoIWlzSUU4KSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgZ3V0dGVyIGVsZW1lbnRzIGZvciBlYWNoIHBhaXIuXG4gICAgICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgZ3V0dGVyRWxlbWVudCA9IGd1dHRlcihpLCBkaXJlY3Rpb24pO1xuICAgICAgICAgICAgICAgIHNldEd1dHRlclNpemUoZ3V0dGVyRWxlbWVudCwgZ3V0dGVyU2l6ZSk7XG5cbiAgICAgICAgICAgICAgICBndXR0ZXJFbGVtZW50W2FkZEV2ZW50TGlzdGVuZXJdKCdtb3VzZWRvd24nLCBzdGFydERyYWdnaW5nLmJpbmQocGFpcikpO1xuICAgICAgICAgICAgICAgIGd1dHRlckVsZW1lbnRbYWRkRXZlbnRMaXN0ZW5lcl0oJ3RvdWNoc3RhcnQnLCBzdGFydERyYWdnaW5nLmJpbmQocGFpcikpO1xuXG4gICAgICAgICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShndXR0ZXJFbGVtZW50LCBlbGVtZW50LmVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgcGFpci5ndXR0ZXIgPSBndXR0ZXJFbGVtZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2V0IHRoZSBlbGVtZW50IHNpemUgdG8gb3VyIGRldGVybWluZWQgc2l6ZS5cbiAgICAgICAgLy8gSGFsZi1zaXplIGd1dHRlcnMgZm9yIGZpcnN0IGFuZCBsYXN0IGVsZW1lbnRzLlxuICAgICAgICBpZiAoaSA9PT0gMCB8fCBpID09PSBpZHMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgc2V0RWxlbWVudFNpemUoZWxlbWVudC5lbGVtZW50LCBlbGVtZW50LnNpemUsIGd1dHRlclNpemUgLyAyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNldEVsZW1lbnRTaXplKGVsZW1lbnQuZWxlbWVudCwgZWxlbWVudC5zaXplLCBndXR0ZXJTaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjb21wdXRlZFNpemUgPSBlbGVtZW50LmVsZW1lbnRbZ2V0Qm91bmRpbmdDbGllbnRSZWN0XSgpW2RpbWVuc2lvbl07XG5cbiAgICAgICAgaWYgKGNvbXB1dGVkU2l6ZSA8IGVsZW1lbnQubWluU2l6ZSkge1xuICAgICAgICAgICAgZWxlbWVudC5taW5TaXplID0gY29tcHV0ZWRTaXplO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWZ0ZXIgdGhlIGZpcnN0IGl0ZXJhdGlvbiwgYW5kIHdlIGhhdmUgYSBwYWlyIG9iamVjdCwgYXBwZW5kIGl0IHRvIHRoZVxuICAgICAgICAvLyBsaXN0IG9mIHBhaXJzLlxuICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgIHBhaXJzLnB1c2gocGFpcik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudFxuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gc2V0U2l6ZXMgKG5ld1NpemVzKSB7XG4gICAgICAgIG5ld1NpemVzLmZvckVhY2goZnVuY3Rpb24gKG5ld1NpemUsIGkpIHtcbiAgICAgICAgICAgIGlmIChpID4gMCkge1xuICAgICAgICAgICAgICAgIHZhciBwYWlyID0gcGFpcnNbaSAtIDFdO1xuICAgICAgICAgICAgICAgIHZhciBhID0gZWxlbWVudHNbcGFpci5hXTtcbiAgICAgICAgICAgICAgICB2YXIgYiA9IGVsZW1lbnRzW3BhaXIuYl07XG5cbiAgICAgICAgICAgICAgICBhLnNpemUgPSBuZXdTaXplc1tpIC0gMV07XG4gICAgICAgICAgICAgICAgYi5zaXplID0gbmV3U2l6ZTtcblxuICAgICAgICAgICAgICAgIHNldEVsZW1lbnRTaXplKGEuZWxlbWVudCwgYS5zaXplLCBwYWlyLmFHdXR0ZXJTaXplKTtcbiAgICAgICAgICAgICAgICBzZXRFbGVtZW50U2l6ZShiLmVsZW1lbnQsIGIuc2l6ZSwgcGFpci5iR3V0dGVyU2l6ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlc3Ryb3kgKCkge1xuICAgICAgICBwYWlycy5mb3JFYWNoKGZ1bmN0aW9uIChwYWlyKSB7XG4gICAgICAgICAgICBwYWlyLnBhcmVudC5yZW1vdmVDaGlsZChwYWlyLmd1dHRlcik7XG4gICAgICAgICAgICBlbGVtZW50c1twYWlyLmFdLmVsZW1lbnQuc3R5bGVbZGltZW5zaW9uXSA9ICcnO1xuICAgICAgICAgICAgZWxlbWVudHNbcGFpci5iXS5lbGVtZW50LnN0eWxlW2RpbWVuc2lvbl0gPSAnJztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGlzSUU4KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzZXRTaXplczogc2V0U2l6ZXMsXG4gICAgICAgICAgICBkZXN0cm95OiBkZXN0cm95LFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgc2V0U2l6ZXM6IHNldFNpemVzLFxuICAgICAgICBnZXRTaXplczogZnVuY3Rpb24gZ2V0U2l6ZXMgKCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnRzLm1hcChmdW5jdGlvbiAoZWxlbWVudCkgeyByZXR1cm4gZWxlbWVudC5zaXplOyB9KVxuICAgICAgICB9LFxuICAgICAgICBjb2xsYXBzZTogZnVuY3Rpb24gY29sbGFwc2UgKGkpIHtcbiAgICAgICAgICAgIGlmIChpID09PSBwYWlycy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFpciA9IHBhaXJzW2kgLSAxXTtcblxuICAgICAgICAgICAgICAgIGNhbGN1bGF0ZVNpemVzLmNhbGwocGFpcik7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWlzSUU4KSB7XG4gICAgICAgICAgICAgICAgICAgIGFkanVzdC5jYWxsKHBhaXIsIHBhaXIuc2l6ZSAtIHBhaXIuYkd1dHRlclNpemUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHBhaXIkMSA9IHBhaXJzW2ldO1xuXG4gICAgICAgICAgICAgICAgY2FsY3VsYXRlU2l6ZXMuY2FsbChwYWlyJDEpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFpc0lFOCkge1xuICAgICAgICAgICAgICAgICAgICBhZGp1c3QuY2FsbChwYWlyJDEsIHBhaXIkMS5hR3V0dGVyU2l6ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBkZXN0cm95OiBkZXN0cm95LFxuICAgIH1cbn07XG5cbnJldHVybiBTcGxpdDtcblxufSkpKTtcbiIsInZhciBnbG9iYWxEYXRhICAgICAgICA9IHJlcXVpcmUoXCIuL2dsb2JhbC5qc1wiKTtcclxuXHJcbnZhciB0cmFjZUNvbG9yTWFwID0gXHJcblsgXHJcbiAgICAvLyBMaWdodCBNb2RlLCBEYXJrIE1vZGVcclxuICAgIFtcIiNDODMyMzJCNFwiICwgXCIjQzgzMjMyQjRcIl0sXHJcbiAgICBbXCIjQ0M2NjAwQzhcIiAsIFwiI0NDNjYwMEM4XCJdLFxyXG4gICAgW1wiI0NDOTkwMEM4XCIgLCBcIiNDQzk5MDBDOFwiXSxcclxuICAgIFtcIiMzMzY2MDBDOFwiICwgXCIjMzM2NjAwQzhcIl0sXHJcbiAgICBbXCIjNjY2NjMzQzhcIiAsIFwiIzY2NjYzM0M4XCJdLFxyXG4gICAgW1wiI0ZGQ0MzM0M4XCIgLCBcIiNGRkNDMzNDOFwiXSxcclxuICAgIFtcIiM2Njk5MDBDOFwiICwgXCIjNjY5OTAwQzhcIl0sXHJcbiAgICBbXCIjOTk5OTY2QzhcIiAsIFwiIzk5OTk2NkM4XCJdLFxyXG4gICAgW1wiIzk5Q0M5OUM4XCIgLCBcIiM5OUNDOTlDOFwiXSxcclxuICAgIFtcIiM2Njk5OTlDOFwiICwgXCIjNjY5OTk5QzhcIl0sXHJcbiAgICBbXCIjMzNDQzk5QzhcIiAsIFwiIzMzQ0M5OUM4XCJdLFxyXG4gICAgW1wiIzY2OTk2NkM4XCIgLCBcIiM2Njk5NjZDOFwiXSxcclxuICAgIFtcIiMzMzY2NjZDOFwiICwgXCIjMzM2NjY2QzhcIl0sXHJcbiAgICBbXCIjMDA5OTY2QzhcIiAsIFwiIzAwOTk2NkM4XCJdLFxyXG4gICAgW1wiIzAwNjY5OUM4XCIgLCBcIiMwMDY2OTlDOFwiXSxcclxuICAgIFtcIiMzMjMyQzhCNFwiICwgXCIjdHJhY2VMYXllckI0XCJdLFxyXG5dO1xyXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICBMaWdodCBNb2RlLCBEYXJrIE1vZGVcclxudmFyIHBhZENvbG9yX0RlZmF1bHQgICAgID0gW1wiIzg3ODc4N1wiLCBcIiM4Nzg3ODdcIl0gICA7XHJcbnZhciBwYWRDb2xvcl9QaW4xICAgICAgICA9IFtcIiNmZmI2MjlcIiwgXCIjZmZiNjI5XCJdICAgO1xyXG52YXIgcGFkQ29sb3JfSXNIaWdobGl0ZWQgPSBbXCIjRDA0MDQwXCIsIFwiI0QwNDA0MFwiXSAgIDtcclxudmFyIHBhZENvbG9yX0lzUGxhY2VkICAgID0gW1wiIzQwRDA0MFwiLCBcIiM0MEQwNDBcIl07XHJcblxyXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBMaWdodCBNb2RlLCBEYXJrIE1vZGVcclxudmFyIGJvdW5kaW5nQm94Q29sb3JfRGVmYXVsdCAgID0gW1wiIzg3ODc4N1wiLCBcIiM4Nzg3ODdcIl07XHJcbnZhciBib3VuZGluZ0JveENvbG9yX1BsYWNlZCAgICA9IFtcIiM0MEQwNDBcIiwgXCIjNDBEMDQwXCJdO1xyXG52YXIgYm91bmRpbmdCb3hDb2xvcl9IaWdobGl0ZWQgPSBbXCIjRDA0MDQwXCIsIFwiI0QwNDA0MFwiXTtcclxudmFyIGJvdW5kaW5nQm94Q29sb3JfRGVidWcgICAgID0gW1wiIzI5NzdmZlwiLCBcIiMyOTc3ZmZcIl07XHJcblxyXG5cclxuXHJcbnZhciBkcmlsbENvbG9yICAgID0gW1wiI0NDQ0NDQ1wiLCBcIiNDQ0NDQ0NcIl07XHJcbnZhciB2aWFDb2xvciAgICAgID0gW1wiIzAwMDAwMFwiLCBcIiMwMDAwMDBcIl07XHJcblxyXG4vLyAgICAgICAgICAgICAgICAgTGlnaHQgTW9kZSwgRGFyayBNb2RlXHJcbnZhciBwY2JFZGdlQ29sb3IgPSBbXCIjMDAwMDAwRkZcIixcIiNGRkZGRkZGRlwiXTtcclxuXHJcblxyXG4vKlxyXG4gICAgQ3VycmVudGx5IDIgc3VwcG9ydGVkIGNvbG9yIHBhbGV0dGUuIFxyXG4gICAgUGFsZXR0ZSAwIGlzIGZvciBsaWdodCBtb2RlLCBhbmQgcGFsZXR0ZSAxIFxyXG4gICAgaWQgZm9yIGRhcmsgbW9kZS5cclxuKi9cclxuZnVuY3Rpb24gR2V0Q29sb3JQYWxldHRlKClcclxue1xyXG4gICAgcmV0dXJuIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiZGFya21vZGVcIikgPT09IFwidHJ1ZVwiKSA/IDEgOiAwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBHZXRUcmFjZUNvbG9yKHRyYWNlTGF5ZXIpXHJcbntcclxuICAgIGlmKHRyYWNlTGF5ZXIgPiAxNSlcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkVSUk9SOiBUcmFjZSBsYXllciBvdXQgb2YgcmFuZ2UuIFVzaW5nIGRlZmF1bHQgY29sb3IuXCIpXHJcbiAgICAgICAgcmV0dXJuIFwiIzAwMDAwMFwiO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0cmFjZUNvbG9yTWFwW3RyYWNlTGF5ZXJdW0dldENvbG9yUGFsZXR0ZSgpXTtcclxuICAgIH1cclxuICAgIFxyXG59XHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIEdldEJvdW5kaW5nQm94Q29sb3IoaXNIaWdobGl0ZWQsIGlzUGxhY2VkKVxyXG57XHJcbiAgICBsZXQgcmVzdWx0ID0gYm91bmRpbmdCb3hDb2xvcl9EZWZhdWx0O1xyXG5cclxuICAgIC8vIE9yZGVyIG9mIGNvbG9yIHNlbGVjdGlvbi5cclxuICAgIGlmIChpc1BsYWNlZCkgXHJcbiAgICB7XHJcbiAgICAgICAgcmVzdWx0ICAgICA9IGJvdW5kaW5nQm94Q29sb3JfUGxhY2VkW0dldENvbG9yUGFsZXR0ZSgpXTtcclxuICAgIH1cclxuICAgIC8vIEhpZ2hsaWdodGVkIGFuZCBub3QgcGxhY2VkXHJcbiAgICBlbHNlIGlmKGlzSGlnaGxpdGVkKVxyXG4gICAge1xyXG4gICAgICAgIHJlc3VsdCAgICAgPSBib3VuZGluZ0JveENvbG9yX0hpZ2hsaXRlZFtHZXRDb2xvclBhbGV0dGUoKV07XHJcbiAgICB9XHJcbiAgICAvKiBcclxuICAgICAgICBJZiBkZWJ1ZyBtb2RlIGlzIGVuYWJsZWQgdGhlbiBmb3JjZSBkcmF3aW5nIGEgYm91bmRpbmcgYm94XHJcbiAgICAgIG5vdCBoaWdobGlnaHRlZCwgIG5vdCBwbGFjZWQsIGFuZCBkZWJ1ZyBtb2RlIGFjdGl2ZVxyXG4gICAgKi9cclxuICAgIGVsc2UgaWYoZ2xvYmFsRGF0YS5nZXREZWJ1Z01vZGUoKSlcclxuICAgIHtcclxuICAgICAgICByZXN1bHQgPSBib3VuZGluZ0JveENvbG9yX0RlYnVnW0dldENvbG9yUGFsZXR0ZSgpXTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICByZXN1bHQgPSBib3VuZGluZ0JveENvbG9yX0RlZmF1bHRbR2V0Q29sb3JQYWxldHRlKCldO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIEdldFBhZENvbG9yKGlzUGluMSwgaXNIaWdobGl0ZWQsIGlzUGxhY2VkKVxyXG57XHJcbiAgICBsZXQgcmVzdWx0ID0gcGFkQ29sb3JfRGVmYXVsdDtcclxuXHJcbiAgICBpZihpc1BpbjEpXHJcbiAgICB7XHJcbiAgICAgICAgcmVzdWx0ID0gcGFkQ29sb3JfUGluMVtHZXRDb2xvclBhbGV0dGUoKV07XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmKGlzUGxhY2VkICYmIGlzSGlnaGxpdGVkKVxyXG4gICAge1xyXG4gICAgICAgIHJlc3VsdCA9IHBhZENvbG9yX0lzUGxhY2VkW0dldENvbG9yUGFsZXR0ZSgpXTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYoaXNIaWdobGl0ZWQpXHJcbiAgICB7XHJcbiAgICAgICAgcmVzdWx0ID0gcGFkQ29sb3JfSXNIaWdobGl0ZWRbR2V0Q29sb3JQYWxldHRlKCldO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIHJlc3VsdCA9IHBhZENvbG9yX0RlZmF1bHRbR2V0Q29sb3JQYWxldHRlKCldO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZnVuY3Rpb24gR2V0UENCRWRnZUNvbG9yKClcclxue1xyXG4gICAgcmV0dXJuIHBjYkVkZ2VDb2xvcltHZXRDb2xvclBhbGV0dGUoKV07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIEdldFZpYUNvbG9yKClcclxue1xyXG4gICAgcmV0dXJuIHZpYUNvbG9yW0dldENvbG9yUGFsZXR0ZSgpXTtcclxufVxyXG5cclxuZnVuY3Rpb24gR2V0RHJpbGxDb2xvcigpXHJcbntcclxuICAgIHJldHVybiBkcmlsbENvbG9yW0dldENvbG9yUGFsZXR0ZSgpXTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgICBHZXRUcmFjZUNvbG9yLCBHZXRCb3VuZGluZ0JveENvbG9yLCBHZXRQYWRDb2xvciwgR2V0UENCRWRnZUNvbG9yLFxyXG4gICAgR2V0VmlhQ29sb3IsIEdldERyaWxsQ29sb3JcclxufTtcclxuIiwiLypcclxuICAgIEZ1bmN0aW9ucyBmb3IgZW5hYmxpbmcgb3IgZGlzYWJsaW5nIGZ1bGwgc2NyZWVuIG1vZGUuXHJcblxyXG4gICAgRnVuY3Rpb25zIGFyZSB0YWtlbiBmcm9tIFczIFNjaG9vbCxcclxuXHJcbiAgICBodHRwczovL3d3dy53M3NjaG9vbHMuY29tL2hvd3RvL2hvd3RvX2pzX2Z1bGxzY3JlZW4uYXNwXHJcbiovXHJcblwidXNlIHN0cmljdFwiO1xyXG5cclxuXHJcbi8qIFZpZXcgaW4gZnVsbHNjcmVlbiAqL1xyXG5mdW5jdGlvbiBvcGVuRnVsbHNjcmVlbigpXHJcbntcclxuICAgIGxldCBlbGVtID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xyXG5cclxuICAgIGlmIChlbGVtLnJlcXVlc3RGdWxsc2NyZWVuKVxyXG4gICAge1xyXG4gICAgICAgIGVsZW0ucmVxdWVzdEZ1bGxzY3JlZW4oKTtcclxuICAgIH1cclxuICAgIC8qIFNhZmFyaSAqL1xyXG4gICAgZWxzZSBpZiAoZWxlbS53ZWJraXRSZXF1ZXN0RnVsbHNjcmVlbilcclxuICAgIHtcclxuICAgICAgICBlbGVtLndlYmtpdFJlcXVlc3RGdWxsc2NyZWVuKCk7XHJcbiAgICB9XHJcbiAgICAvKiBJRTExICovXHJcbiAgICBlbHNlIGlmIChlbGVtLm1zUmVxdWVzdEZ1bGxzY3JlZW4pXHJcbiAgICB7XHJcbiAgICAgICAgZWxlbS5tc1JlcXVlc3RGdWxsc2NyZWVuKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qIENsb3NlIGZ1bGxzY3JlZW4gKi9cclxuZnVuY3Rpb24gY2xvc2VGdWxsc2NyZWVuKClcclxue1xyXG4gICAgaWYgKGRvY3VtZW50LmV4aXRGdWxsc2NyZWVuKVxyXG4gICAge1xyXG4gICAgICAgIGRvY3VtZW50LmV4aXRGdWxsc2NyZWVuKCk7XHJcbiAgICB9XHJcbiAgICAvKiBTYWZhcmkgKi9cclxuICAgIGVsc2UgaWYgKGRvY3VtZW50LndlYmtpdEV4aXRGdWxsc2NyZWVuKVxyXG4gICAge1xyXG4gICAgICAgIGRvY3VtZW50LndlYmtpdEV4aXRGdWxsc2NyZWVuKCk7XHJcbiAgICB9XHJcbiAgICAvKiBJRTExICovXHJcbiAgICBlbHNlIGlmIChkb2N1bWVudC5tc0V4aXRGdWxsc2NyZWVuKVxyXG4gICAge1xyXG4gICAgICAgIGRvY3VtZW50Lm1zRXhpdEZ1bGxzY3JlZW4oKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgb3BlbkZ1bGxzY3JlZW4sIGNsb3NlRnVsbHNjcmVlblxyXG59O1xyXG4iLCJcInVzZSBzdHJpY3RcIjtcclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgICAgICAgICAgQm9hcmQgUm90YXRpb24gICAgICAgICAgICAgICAgICAgIFxyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5sZXQgc3RvcmFnZSA9IHVuZGVmaW5lZDtcclxuY29uc3Qgc3RvcmFnZVByZWZpeCA9IFwiSU5URVJBQ1RJVkVfUENCX19cIiArIHBjYmRhdGEubWV0YWRhdGEudGl0bGUgKyBcIl9fXCIgKyBwY2JkYXRhLm1ldGFkYXRhLnJldmlzaW9uICsgXCJfX1wiXHJcblxyXG5mdW5jdGlvbiBpbml0U3RvcmFnZSAoKVxyXG57XHJcbiAgICB0cnlcclxuICAgIHtcclxuICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJibGFua1wiKTtcclxuICAgICAgICBzdG9yYWdlID0gd2luZG93LmxvY2FsU3RvcmFnZTtcclxuICAgIH1cclxuICAgIGNhdGNoIChlKVxyXG4gICAge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiRVJST1I6IFN0b3JhZ2UgaW5pdCBlcnJvclwiKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXN0b3JhZ2UpXHJcbiAgICB7XHJcbiAgICAgICAgdHJ5XHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB3aW5kb3cuc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShcImJsYW5rXCIpO1xyXG4gICAgICAgICAgICBzdG9yYWdlID0gd2luZG93LnNlc3Npb25TdG9yYWdlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXRjaCAoZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRVJST1I6IFNlc3Npb24gc3RvcmFnZSBub3QgYXZhaWxhYmxlXCIpO1xyXG4gICAgICAgICAgICAvLyBzZXNzaW9uU3RvcmFnZSBhbHNvIG5vdCBhdmFpbGFibGVcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRTdG9yYWdlKGtleSlcclxue1xyXG4gICAgaWYgKHN0b3JhZ2UpXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuIHN0b3JhZ2UuZ2V0SXRlbShzdG9yYWdlUHJlZml4ICsgXCIjXCIgKyBrZXkpO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB3cml0ZVN0b3JhZ2Uoa2V5LCB2YWx1ZSlcclxue1xyXG4gICAgaWYgKHN0b3JhZ2UpXHJcbiAgICB7XHJcbiAgICAgICAgc3RvcmFnZS5zZXRJdGVtKHN0b3JhZ2VQcmVmaXggKyBcIiNcIiArIGtleSwgdmFsdWUpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICAgICAgICAgICBIaWdobGlnaHRlZCBSZWZzICAgICAgICAgICAgICAgICAgICBcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGhpZ2hsaWdodGVkUmVmcyA9IFtdO1xyXG5cclxuZnVuY3Rpb24gc2V0SGlnaGxpZ2h0ZWRSZWZzKHJlZnMpXHJcbntcclxuICAgIGhpZ2hsaWdodGVkUmVmcyA9IHJlZnMuc3BsaXQoXCIsXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRIaWdobGlnaHRlZFJlZnMoKVxyXG57XHJcbiAgICByZXR1cm4gaGlnaGxpZ2h0ZWRSZWZzO1xyXG59XHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgICAgICAgICAgIFJlZHJhdyBPbiBEcmFnICAgICAgICAgICAgICAgICAgICAgIFxyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5sZXQgcmVkcmF3T25EcmFnID0gdHJ1ZTtcclxuXHJcbmZ1bmN0aW9uIHNldFJlZHJhd09uRHJhZyh2YWx1ZSlcclxue1xyXG4gICAgcmVkcmF3T25EcmFnID0gdmFsdWU7XHJcbiAgICB3cml0ZVN0b3JhZ2UoXCJyZWRyYXdPbkRyYWdcIiwgdmFsdWUpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRSZWRyYXdPbkRyYWcoKVxyXG57XHJcbiAgICByZXR1cm4gcmVkcmF3T25EcmFnO1xyXG59XHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgICAgICAgICAgICAgRGVidWcgTW9kZSAgICAgICAgICAgICAgICAgICAgICAgXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCBkZWJ1Z01vZGUgPSBmYWxzZTtcclxuXHJcbmZ1bmN0aW9uIHNldERlYnVnTW9kZSh2YWx1ZSlcclxue1xyXG4gICAgZGVidWdNb2RlID0gdmFsdWU7XHJcbiAgICB3cml0ZVN0b3JhZ2UoXCJkZWJ1Z01vZGVcIiwgdmFsdWUpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXREZWJ1Z01vZGUoKVxyXG57XHJcbiAgICByZXR1cm4gZGVidWdNb2RlO1xyXG59XHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxubGF5ZXIgU3BsaXRcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGxheWVyc3BsaXQ7XHJcblxyXG5mdW5jdGlvbiBzZXRMYXllclNwbGl0KHZhbHVlKVxyXG57XHJcbiAgICBsYXllcnNwbGl0ID0gdmFsdWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldExheWVyU3BsaXQoKVxyXG57XHJcbiAgICByZXR1cm4gbGF5ZXJzcGxpdDtcclxufVxyXG5cclxuZnVuY3Rpb24gZGVzdHJveUxheWVyU3BsaXQoKVxyXG57XHJcbiAgICBpZihsYXllcnNwbGl0ICE9PSBudWxsKVxyXG4gICAge1xyXG4gICAgICAgIGxheWVyc3BsaXQuZGVzdHJveSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG5CT00gU3BsaXRcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGJvbXNwbGl0O1xyXG5cclxuZnVuY3Rpb24gc2V0Qm9tU3BsaXQodmFsdWUpXHJcbntcclxuICAgIGJvbXNwbGl0ID0gdmFsdWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEJvbVNwbGl0KClcclxue1xyXG4gICAgcmV0dXJuIGJvbXNwbGl0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZXN0cm95Qm9tU3BsaXQoKVxyXG57XHJcbiAgICBib21zcGxpdC5kZXN0cm95KCk7XHJcbn1cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG5DYW52YXMgU3BsaXRcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGNhbnZhc3NwbGl0O1xyXG5cclxuZnVuY3Rpb24gc2V0Q2FudmFzU3BsaXQodmFsdWUpXHJcbntcclxuICAgIGNhbnZhc3NwbGl0ID0gdmFsdWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldENhbnZhc1NwbGl0KClcclxue1xyXG4gICAgcmV0dXJuIGNhbnZhc3NwbGl0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZXN0cm95Q2FudmFzU3BsaXQoKVxyXG57XHJcbiAgICBjYW52YXNzcGxpdC5kZXN0cm95KCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbGxhcHNlQ2FudmFzU3BsaXQodmFsdWUpXHJcbntcclxuICAgIGNhbnZhc3NwbGl0LmNvbGxhcHNlKHZhbHVlKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0U2l6ZXNDYW52YXNTcGxpdCgpXHJcbntcclxuICAgIGNhbnZhc3NwbGl0LnNldFNpemVzKFs1MCwgNTBdKTtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkNhbnZhcyBMYXlvdXRcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGNhbnZhc2xheW91dCA9IFwiRkJcIjtcclxuXHJcbi8qWFhYIEZvdW5kIGEgYnVnIGF0IHN0YXJ0dXAuIENvZGUgYXNzdW1lcyB0aGF0IGNhbnZhcyBsYXlvdXQgXHJcbmlzIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXMuIHRoZW4gc3lzdGVtIGZhaWxzLiBoZSBidWcgd2FzIHRoYXQgdGhlIFxyXG5jYW52YXNMYXlvdXQgd2FzIGJlaW5nIHNldCB0byAnZGVmYXVsdCcgd2hpY2ggaXMgbm90IGEgdmFsaWQgc3RhdGUuIFxyXG5TbyBubyBpcyBjaGVjayB0aGF0IGlmIGRlZmF1bHQgaXMgc2VudCBpbiB0aGVuIHNldCB0aGUgbGF5b3V0IHRvIEZCIG1vZGUuXHJcbiovXHJcbi8qIFRPRE86IE1ha2UgdGhlIGRlZmF1bHQgY2hlY2sgYmVsb3cgYWN0dWFsbHkgY2hlY2sgdGhhdCB0aGUgaXRlbSBcclxuaXMgaW4gb25lIG9mIHRoZSB0aHJlZSB2YWxpZCBzdGF0ZXMuIElmIG5vdCB0aGVuIHNldCB0byBGQiwgb3RoZXJ3aXNlIHNldCB0byBvbmUgb2ZcclxudGhlIHRocmVlIHZhbGlkIHN0YXRlc1xyXG4qL1xyXG5mdW5jdGlvbiBzZXRDYW52YXNMYXlvdXQodmFsdWUpXHJcbntcclxuICAgIGlmKHZhbHVlID09IFwiZGVmYXVsdFwiKVxyXG4gICAge1xyXG4gICAgICAgIGNhbnZhc2xheW91dCA9IFwiRkJcIjtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBjYW52YXNsYXlvdXQgPSB2YWx1ZTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Q2FudmFzTGF5b3V0KClcclxue1xyXG4gICAgcmV0dXJuIGNhbnZhc2xheW91dDtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkJPTSBMYXlvdXRcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGJvbWxheW91dCA9IFwiZGVmYXVsdFwiO1xyXG5cclxuZnVuY3Rpb24gc2V0Qm9tTGF5b3V0KHZhbHVlKVxyXG57XHJcbiAgICBib21sYXlvdXQgPSB2YWx1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Qm9tTGF5b3V0KClcclxue1xyXG4gICAgcmV0dXJuIGJvbWxheW91dDtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkJPTSBTb3J0IEZ1bmN0aW9uXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCBib21Tb3J0RnVuY3Rpb24gPSBudWxsO1xyXG5cclxuZnVuY3Rpb24gc2V0Qm9tU29ydEZ1bmN0aW9uKHZhbHVlKVxyXG57XHJcbiAgICBib21Tb3J0RnVuY3Rpb24gPSB2YWx1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Qm9tU29ydEZ1bmN0aW9uKClcclxue1xyXG4gICAgcmV0dXJuIGJvbVNvcnRGdW5jdGlvbjtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkN1cnJlbnQgU29ydCBDb2x1bW5cclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGN1cnJlbnRTb3J0Q29sdW1uID0gbnVsbDtcclxuXHJcbmZ1bmN0aW9uIHNldEN1cnJlbnRTb3J0Q29sdW1uKHZhbHVlKVxyXG57XHJcbiAgICBjdXJyZW50U29ydENvbHVtbiA9IHZhbHVlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRDdXJyZW50U29ydENvbHVtbigpXHJcbntcclxuICAgIHJldHVybiBjdXJyZW50U29ydENvbHVtbjtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkN1cnJlbnQgU29ydCBPcmRlclxyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5sZXQgY3VycmVudFNvcnRPcmRlciA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBzZXRDdXJyZW50U29ydE9yZGVyKHZhbHVlKVxyXG57XHJcbiAgICBjdXJyZW50U29ydE9yZGVyID0gdmFsdWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEN1cnJlbnRTb3J0T3JkZXIoKVxyXG57XHJcbiAgICByZXR1cm4gY3VycmVudFNvcnRPcmRlcjtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkN1cnJlbnQgSGlnaGxpZ2h0ZWQgUm93IElEXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCBjdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZDtcclxuXHJcbmZ1bmN0aW9uIHNldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKHZhbHVlKVxyXG57XHJcbiAgICBjdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCA9IHZhbHVlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpXHJcbntcclxuICAgIHJldHVybiBjdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZDtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkhpZ2hsaWdodCBIYW5kbGVyc1xyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5sZXQgaGlnaGxpZ2h0SGFuZGxlcnMgPSBbXTtcclxuXHJcbmZ1bmN0aW9uIHNldEhpZ2hsaWdodEhhbmRsZXJzKHZhbHVlcylcclxue1xyXG4gICAgaGlnaGxpZ2h0SGFuZGxlcnMgPSB2YWx1ZXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEhpZ2hsaWdodEhhbmRsZXJzKCl7XHJcbiAgICByZXR1cm4gaGlnaGxpZ2h0SGFuZGxlcnM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHB1c2hIaWdobGlnaHRIYW5kbGVycyh2YWx1ZSlcclxue1xyXG4gICAgaGlnaGxpZ2h0SGFuZGxlcnMucHVzaCh2YWx1ZSk7XHJcbn1cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG5DaGVja2JveGVzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCBjaGVja2JveGVzID0gW107XHJcblxyXG5mdW5jdGlvbiBzZXRDaGVja2JveGVzKHZhbHVlcylcclxue1xyXG4gICAgY2hlY2tib3hlcyA9IHZhbHVlcztcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Q2hlY2tib3hlcygpXHJcbntcclxuICAgIHJldHVybiBjaGVja2JveGVzO1xyXG59XHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuQk9NIENoZWNrYm94ZXNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGJvbUNoZWNrYm94ZXMgPSBcIlwiO1xyXG5cclxuZnVuY3Rpb24gc2V0Qm9tQ2hlY2tib3hlcyh2YWx1ZXMpXHJcbntcclxuICAgIGJvbUNoZWNrYm94ZXMgPSB2YWx1ZXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEJvbUNoZWNrYm94ZXMoKVxyXG57XHJcbiAgICByZXR1cm4gYm9tQ2hlY2tib3hlcztcclxufVxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuUmVtb3ZlIEJPTSBFbnRyaWVzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCByZW1vdmVCT01FbnRyaWVzID0gXCJcIjtcclxuXHJcbmZ1bmN0aW9uIHNldFJlbW92ZUJPTUVudHJpZXModmFsdWVzKVxyXG57XHJcbiAgICByZW1vdmVCT01FbnRyaWVzID0gdmFsdWVzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRSZW1vdmVCT01FbnRyaWVzKClcclxue1xyXG4gICAgcmV0dXJuIHJlbW92ZUJPTUVudHJpZXM7XHJcbn1cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG5SZW1vdmUgQk9NIEVudHJpZXNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGFkZGl0aW9uYWxBdHRyaWJ1dGVzID0gXCJcIjtcclxuXHJcbmZ1bmN0aW9uIHNldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKHZhbHVlcylcclxue1xyXG4gICAgYWRkaXRpb25hbEF0dHJpYnV0ZXMgPSB2YWx1ZXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKCl7XHJcbiAgICByZXR1cm4gYWRkaXRpb25hbEF0dHJpYnV0ZXM7XHJcbn1cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG5IaWdobGlnaHQgUGluIDFcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGhpZ2hsaWdodHBpbjEgPSBmYWxzZTtcclxuXHJcbmZ1bmN0aW9uIHNldEhpZ2hsaWdodFBpbjEodmFsdWUpXHJcbntcclxuICAgIHdyaXRlU3RvcmFnZShcImhpZ2hsaWdodHBpbjFcIiwgdmFsdWUpO1xyXG4gICAgaGlnaGxpZ2h0cGluMSA9IHZhbHVlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRIaWdobGlnaHRQaW4xKCl7XHJcbiAgICByZXR1cm4gaGlnaGxpZ2h0cGluMTtcclxufVxyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkxhc3QgQ2xpY2tlZCBSZWZcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IGxhc3RDbGlja2VkUmVmO1xyXG5cclxuZnVuY3Rpb24gc2V0TGFzdENsaWNrZWRSZWYodmFsdWUpXHJcbntcclxuICAgIGxhc3RDbGlja2VkUmVmID0gdmFsdWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldExhc3RDbGlja2VkUmVmKClcclxue1xyXG4gICAgcmV0dXJuIGxhc3RDbGlja2VkUmVmO1xyXG59XHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkNvbWJpbmUgVmFsdWVzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCBjb21iaW5lVmFsdWVzID0gZmFsc2U7XHJcblxyXG5mdW5jdGlvbiBzZXRDb21iaW5lVmFsdWVzKHZhbHVlKVxyXG57XHJcbiAgICB3cml0ZVN0b3JhZ2UoXCJjb21iaW5lVmFsdWVzXCIsIHZhbHVlKTtcclxuICAgIGNvbWJpbmVWYWx1ZXMgPSB2YWx1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Q29tYmluZVZhbHVlcygpXHJcbntcclxuICAgIHJldHVybiBjb21iaW5lVmFsdWVzO1xyXG59XHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcblxyXG5cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbkNvbWJpbmUgVmFsdWVzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCBoaWRlUGxhY2VkUGFydHMgPSBmYWxzZTtcclxuXHJcbmZ1bmN0aW9uIHNldEhpZGVQbGFjZWRQYXJ0cyh2YWx1ZSlcclxue1xyXG4gICAgd3JpdGVTdG9yYWdlKFwiaGlkZVBsYWNlZFBhcnRzXCIsIHZhbHVlKTtcclxuICAgIGhpZGVQbGFjZWRQYXJ0cyA9IHZhbHVlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRIaWRlUGxhY2VkUGFydHMoKVxyXG57XHJcbiAgICByZXR1cm4gaGlkZVBsYWNlZFBhcnRzO1xyXG59XHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcblxyXG5sZXQgYWxsY2FudmFzID0gIHVuZGVmaW5lZDtcclxuXHJcbmZ1bmN0aW9uIFNldEFsbENhbnZhcyh2YWx1ZSlcclxue1xyXG4gICAgYWxsY2FudmFzID0gdmFsdWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIEdldEFsbENhbnZhcygpXHJcbntcclxuICAgIHJldHVybiBhbGxjYW52YXM7XHJcbn1cclxuXHJcblxyXG5sZXQgYm9hcmRSb3RhdGlvbiA9IDA7XHJcbmZ1bmN0aW9uIFNldEJvYXJkUm90YXRpb24odmFsdWUpXHJcbntcclxuICAgIGJvYXJkUm90YXRpb24gPSB2YWx1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gR2V0Qm9hcmRSb3RhdGlvbigpXHJcbntcclxuICAgIHJldHVybiBib2FyZFJvdGF0aW9uO1xyXG59XHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgICBpbml0U3RvcmFnZSAgICAgICAgICAgICAgICAsIHJlYWRTdG9yYWdlICAgICAgICAgICAgICAgICwgd3JpdGVTdG9yYWdlICAgICAgICAgICxcclxuICAgIHNldEhpZ2hsaWdodGVkUmVmcyAgICAgICAgICwgZ2V0SGlnaGxpZ2h0ZWRSZWZzICAgICAgICAgLFxyXG4gICAgc2V0UmVkcmF3T25EcmFnICAgICAgICAgICAgLCBnZXRSZWRyYXdPbkRyYWcgICAgICAgICAgICAsXHJcbiAgICBzZXREZWJ1Z01vZGUgICAgICAgICAgICAgICAsIGdldERlYnVnTW9kZSAgICAgICAgICAgICAgICxcclxuICAgIHNldEJvbVNwbGl0ICAgICAgICAgICAgICAgICwgZ2V0Qm9tU3BsaXQgICAgICAgICAgICAgICAgLCBkZXN0cm95Qm9tU3BsaXQgICAgICAgLFxyXG4gICAgc2V0TGF5ZXJTcGxpdCAgICAgICAgICAgICAgLCBnZXRMYXllclNwbGl0ICAgICAgICAgICAgICAsIGRlc3Ryb3lMYXllclNwbGl0ICAgICAsXHJcbiAgICBzZXRDYW52YXNTcGxpdCAgICAgICAgICAgICAsIGdldENhbnZhc1NwbGl0ICAgICAgICAgICAgICwgZGVzdHJveUNhbnZhc1NwbGl0ICAgICwgY29sbGFwc2VDYW52YXNTcGxpdCAsIHNldFNpemVzQ2FudmFzU3BsaXQgLFxyXG4gICAgc2V0Q2FudmFzTGF5b3V0ICAgICAgICAgICAgLCBnZXRDYW52YXNMYXlvdXQgICAgICAgICAgICAsXHJcbiAgICBzZXRCb21MYXlvdXQgICAgICAgICAgICAgICAsIGdldEJvbUxheW91dCAgICAgICAgICAgICAgICxcclxuICAgIHNldEJvbVNvcnRGdW5jdGlvbiAgICAgICAgICwgZ2V0Qm9tU29ydEZ1bmN0aW9uICAgICAgICAgLFxyXG4gICAgc2V0Q3VycmVudFNvcnRDb2x1bW4gICAgICAgLCBnZXRDdXJyZW50U29ydENvbHVtbiAgICAgICAsXHJcbiAgICBzZXRDdXJyZW50U29ydE9yZGVyICAgICAgICAsIGdldEN1cnJlbnRTb3J0T3JkZXIgICAgICAgICxcclxuICAgIHNldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkICwgZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQgLFxyXG4gICAgc2V0SGlnaGxpZ2h0SGFuZGxlcnMgICAgICAgLCBnZXRIaWdobGlnaHRIYW5kbGVycyAgICAgICAsIHB1c2hIaWdobGlnaHRIYW5kbGVycyAsXHJcbiAgICBzZXRDaGVja2JveGVzICAgICAgICAgICAgICAsIGdldENoZWNrYm94ZXMgICAgICAgICAgICAgICxcclxuICAgIHNldEJvbUNoZWNrYm94ZXMgICAgICAgICAgICwgZ2V0Qm9tQ2hlY2tib3hlcyAgICAgICAgICAgLFxyXG4gICAgc2V0UmVtb3ZlQk9NRW50cmllcyAgICAgICAgLCBnZXRSZW1vdmVCT01FbnRyaWVzICAgICAgICAsXHJcbiAgICBzZXRBZGRpdGlvbmFsQXR0cmlidXRlcyAgICAsIGdldEFkZGl0aW9uYWxBdHRyaWJ1dGVzICAgICxcclxuICAgIHNldEhpZ2hsaWdodFBpbjEgICAgICAgICAgICwgZ2V0SGlnaGxpZ2h0UGluMSAgICAgICAgICAgLFxyXG4gICAgc2V0TGFzdENsaWNrZWRSZWYgICAgICAgICAgLCBnZXRMYXN0Q2xpY2tlZFJlZiAgICAgICAgICAsXHJcbiAgICBzZXRDb21iaW5lVmFsdWVzICAgICAgICAgICAsIGdldENvbWJpbmVWYWx1ZXMgICAgICAgICAgICxcclxuICAgIHNldEhpZGVQbGFjZWRQYXJ0cyAgICAgICAgICwgZ2V0SGlkZVBsYWNlZFBhcnRzICAgICAgICAgLFxyXG4gICAgU2V0QWxsQ2FudmFzICAgICAgICAgICAgICAgLCBHZXRBbGxDYW52YXMgICAgICAgICAgICAgICAsXHJcbiAgICBTZXRCb2FyZFJvdGF0aW9uICAgICAgICAgICAsIEdldEJvYXJkUm90YXRpb25cclxuXHJcbn07IiwidmFyIGdsb2JhbERhdGEgPSByZXF1aXJlKFwiLi9nbG9iYWwuanNcIik7XHJcbnZhciByZW5kZXIgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyLmpzXCIpO1xyXG5cclxuZnVuY3Rpb24gaGFuZGxlTW91c2VEb3duKGUsIGxheWVyZGljdCkgXHJcbntcclxuICAgIGlmIChlLndoaWNoICE9IDEpIFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIFxyXG4gICAgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZXN0YXJ0eCA9IGUub2Zmc2V0WDtcclxuICAgIGxheWVyZGljdC50cmFuc2Zvcm0ubW91c2VzdGFydHkgPSBlLm9mZnNldFk7XHJcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93bnggPSBlLm9mZnNldFg7XHJcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93bnkgPSBlLm9mZnNldFk7XHJcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93biA9IHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNtb290aFNjcm9sbFRvUm93KHJvd2lkKSBcclxue1xyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQocm93aWQpLnNjcm9sbEludG9WaWV3KHtcclxuICAgICAgICBiZWhhdmlvcjogXCJzbW9vdGhcIixcclxuICAgICAgICBibG9jazogXCJjZW50ZXJcIixcclxuICAgICAgICBpbmxpbmU6IFwibmVhcmVzdFwiXHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gbW9kdWxlc0NsaWNrZWQocmVmZXJlbmNlcykgXHJcbntcclxuICAgIGxldCBsYXN0Q2xpY2tlZEluZGV4ID0gcmVmZXJlbmNlcy5pbmRleE9mKGdsb2JhbERhdGEuZ2V0TGFzdENsaWNrZWRSZWYoKSk7XHJcbiAgICBsZXQgcmVmID0gcmVmZXJlbmNlc1sobGFzdENsaWNrZWRJbmRleCArIDEpICUgcmVmZXJlbmNlcy5sZW5ndGhdO1xyXG4gICAgZm9yIChsZXQgaGFuZGxlciBvZiBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKCkpIFxyXG4gICAge1xyXG4gICAgICAgIGlmIChoYW5kbGVyLnJlZnMuaW5kZXhPZihyZWYpID49IDApIFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRMYXN0Q2xpY2tlZFJlZihyZWYpO1xyXG4gICAgICAgICAgICBoYW5kbGVyLmhhbmRsZXIoKTtcclxuICAgICAgICAgICAgc21vb3RoU2Nyb2xsVG9Sb3coZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcbmZ1bmN0aW9uIGJib3hTY2FuKGxheWVyLCB4LCB5KSBcclxue1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG4gICAgZm9yIChsZXQgcGFydCBvZiBwY2JkYXRhLnBhcnRzKSBcclxuICAgIHtcclxuICAgICAgICBpZiggcGFydC5sb2NhdGlvbiA9PSBsYXllcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBiID0gcGFydC5wYWNrYWdlLmJvdW5kaW5nX2JveDtcclxuICAgICAgICAgICAgaWYgKCAgICAoeCA+IGIueDAgKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAoeCA8IGIueDEgKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAoeSA+IGIueTAgKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAoeSA8IGIueTEgKVxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHBhcnQubmFtZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gaGFuZGxlTW91c2VDbGljayhlLCBsYXllcmRpY3QpIFxyXG57XHJcbiAgICBsZXQgeCA9IGUub2Zmc2V0WDtcclxuICAgIGxldCB5ID0gZS5vZmZzZXRZO1xyXG4gICAgbGV0IHQgPSBsYXllcmRpY3QudHJhbnNmb3JtO1xyXG4gICAgaWYgKGxheWVyZGljdC5sYXllciAhPSBcIkJcIikgXHJcbiAgICB7XHJcbiAgICAgICAgeCA9ICgyICogeCAvIHQuem9vbSAtIHQucGFueCArIHQueCkgLyAtdC5zO1xyXG4gICAgfSBcclxuICAgIGVsc2UgXHJcbiAgICB7XHJcbiAgICAgICAgeCA9ICgyICogeCAvIHQuem9vbSAtIHQucGFueCAtIHQueCkgLyB0LnM7XHJcbiAgICB9XHJcbiAgICB5ID0gKDIgKiB5IC8gdC56b29tIC0gdC55IC0gdC5wYW55KSAvIHQucztcclxuICAgIGxldCB2ID0gcmVuZGVyLlJvdGF0ZVZlY3RvcihbeCwgeV0sIC1nbG9iYWxEYXRhLkdldEJvYXJkUm90YXRpb24oKSk7XHJcbiAgICBsZXQgcmVmbGlzdCA9IGJib3hTY2FuKGxheWVyZGljdC5sYXllciwgdlswXSwgdlsxXSwgdCk7XHJcbiAgICBpZiAocmVmbGlzdC5sZW5ndGggPiAwKSBcclxuICAgIHtcclxuICAgICAgICBtb2R1bGVzQ2xpY2tlZChyZWZsaXN0KTtcclxuICAgICAgICByZW5kZXIuZHJhd0hpZ2hsaWdodHMoKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaGFuZGxlTW91c2VVcChlLCBsYXllcmRpY3QpIFxyXG57XHJcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgaWYgKCAgICBlLndoaWNoID09IDFcclxuICAgICAgICAgJiYgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZWRvd25cclxuICAgICAgICAgJiYgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZWRvd254ID09IGUub2Zmc2V0WFxyXG4gICAgICAgICAmJiBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93bnkgPT0gZS5vZmZzZXRZXHJcbiAgICApIFxyXG4gICAge1xyXG4gICAgICAgIC8vIFRoaXMgaXMganVzdCBhIGNsaWNrXHJcbiAgICAgICAgaGFuZGxlTW91c2VDbGljayhlLCBsYXllcmRpY3QpO1xyXG4gICAgICAgIGxheWVyZGljdC50cmFuc2Zvcm0ubW91c2Vkb3duID0gZmFsc2U7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKGUud2hpY2ggPT0gMykgXHJcbiAgICB7XHJcbiAgICAgICAgLy8gUmVzZXQgcGFuIGFuZCB6b29tIG9uIHJpZ2h0IGNsaWNrLlxyXG4gICAgICAgIGxheWVyZGljdC50cmFuc2Zvcm0ucGFueCA9IDA7XHJcbiAgICAgICAgbGF5ZXJkaWN0LnRyYW5zZm9ybS5wYW55ID0gMDtcclxuICAgICAgICBsYXllcmRpY3QudHJhbnNmb3JtLnpvb20gPSAxO1xyXG4gICAgICAgIHJlbmRlci5kcmF3Q2FudmFzKGxheWVyZGljdCk7XHJcbiAgICB9IFxyXG4gICAgZWxzZSBpZiAoIWdsb2JhbERhdGEuZ2V0UmVkcmF3T25EcmFnKCkpIFxyXG4gICAge1xyXG4gICAgICAgIHJlbmRlci5kcmF3Q2FudmFzKGxheWVyZGljdCk7XHJcbiAgICB9XHJcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93biA9IGZhbHNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVNb3VzZU1vdmUoZSwgbGF5ZXJkaWN0KSBcclxue1xyXG4gICAgaWYgKCFsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlZG93bikgXHJcbiAgICB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGxldCBkeCA9IGUub2Zmc2V0WCAtIGxheWVyZGljdC50cmFuc2Zvcm0ubW91c2VzdGFydHg7XHJcbiAgICBsZXQgZHkgPSBlLm9mZnNldFkgLSBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlc3RhcnR5O1xyXG4gICAgbGF5ZXJkaWN0LnRyYW5zZm9ybS5wYW54ICs9IDIgKiBkeCAvIGxheWVyZGljdC50cmFuc2Zvcm0uem9vbTtcclxuICAgIGxheWVyZGljdC50cmFuc2Zvcm0ucGFueSArPSAyICogZHkgLyBsYXllcmRpY3QudHJhbnNmb3JtLnpvb207XHJcbiAgICBsYXllcmRpY3QudHJhbnNmb3JtLm1vdXNlc3RhcnR4ID0gZS5vZmZzZXRYO1xyXG4gICAgbGF5ZXJkaWN0LnRyYW5zZm9ybS5tb3VzZXN0YXJ0eSA9IGUub2Zmc2V0WTtcclxuICAgIFxyXG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0UmVkcmF3T25EcmFnKCkpIFxyXG4gICAge1xyXG4gICAgICAgIHJlbmRlci5kcmF3Q2FudmFzKGxheWVyZGljdCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGhhbmRsZU1vdXNlV2hlZWwoZSwgbGF5ZXJkaWN0KSBcclxue1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIHZhciB0ID0gbGF5ZXJkaWN0LnRyYW5zZm9ybTtcclxuICAgIHZhciB3aGVlbGRlbHRhID0gZS5kZWx0YVk7XHJcbiAgICBpZiAoZS5kZWx0YU1vZGUgPT0gMSkgXHJcbiAgICB7XHJcbiAgICAgICAgLy8gRkYgb25seSwgc2Nyb2xsIGJ5IGxpbmVzXHJcbiAgICAgICAgd2hlZWxkZWx0YSAqPSAzMDtcclxuICAgIH0gXHJcbiAgICBlbHNlIGlmIChlLmRlbHRhTW9kZSA9PSAyKSBcclxuICAgIHtcclxuICAgICAgICB3aGVlbGRlbHRhICo9IDMwMDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIG0gPSBNYXRoLnBvdygxLjEsIC13aGVlbGRlbHRhIC8gNDApO1xyXG4gICAgLy8gTGltaXQgYW1vdW50IG9mIHpvb20gcGVyIHRpY2suXHJcbiAgICBpZiAobSA+IDIpIFxyXG4gICAge1xyXG4gICAgICAgIG0gPSAyO1xyXG4gICAgfSBcclxuICAgIGVsc2UgaWYgKG0gPCAwLjUpIFxyXG4gICAge1xyXG4gICAgICAgIG0gPSAwLjU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHQuem9vbSAqPSBtO1xyXG4gICAgdmFyIHpvb21kID0gKDEgLSBtKSAvIHQuem9vbTtcclxuICAgIHQucGFueCArPSAyICogZS5vZmZzZXRYICogem9vbWQ7XHJcbiAgICB0LnBhbnkgKz0gMiAqIGUub2Zmc2V0WSAqIHpvb21kO1xyXG4gICAgcmVuZGVyLmRyYXdDYW52YXMobGF5ZXJkaWN0KTtcclxuICAgIHJlbmRlci5kcmF3SGlnaGxpZ2h0cygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZGRNb3VzZUhhbmRsZXJzKGRpdiwgbGF5ZXJkaWN0KSBcclxue1xyXG4gICAgZGl2Lm9ubW91c2VjbGljayA9IGZ1bmN0aW9uKGUpXHJcbiAgICB7XHJcbiAgICAgICAgaGFuZGxlTW91c2VDbGljayhlLCBsYXllcmRpY3QpO1xyXG4gICAgfTtcclxuXHJcbiAgICBkaXYub25tb3VzZWRvd24gPSBmdW5jdGlvbihlKSBcclxuICAgIHtcclxuICAgICAgICBoYW5kbGVNb3VzZURvd24oZSwgbGF5ZXJkaWN0KTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIGRpdi5vbm1vdXNlbW92ZSA9IGZ1bmN0aW9uKGUpIFxyXG4gICAge1xyXG4gICAgICAgIGhhbmRsZU1vdXNlTW92ZShlLCBsYXllcmRpY3QpO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZGl2Lm9ubW91c2V1cCA9IGZ1bmN0aW9uKGUpIFxyXG4gICAge1xyXG4gICAgICAgIGhhbmRsZU1vdXNlVXAoZSwgbGF5ZXJkaWN0KTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIC8vIFRPRE86IE5lZWRlZCBpZiB3YW50aW5nIG1vdXNlIG1vdmUgb3ZlciBwYXJ0IGluIGJvbSBhbmQgbm90IGNsaWNrIGJlaGF2aW9yXHJcbiAgICAvL2Rpdi5vbm1vdXNlb3V0ID0gZnVuY3Rpb24oZSkgXHJcbiAgICAvL3tcclxuICAgIC8vICAgIGhhbmRsZU1vdXNlVXAoZSwgbGF5ZXJkaWN0KTtcclxuICAgIC8vfTtcclxuXHJcbiAgICBkaXYub253aGVlbCA9IGZ1bmN0aW9uKGUpIFxyXG4gICAge1xyXG4gICAgICAgIGhhbmRsZU1vdXNlV2hlZWwoZSwgbGF5ZXJkaWN0KTtcclxuICAgIH07XHJcbiAgICBcclxuICAgIFxyXG4gICAgZm9yICh2YXIgZWxlbWVudCBvZiBbZGl2XSkgXHJcbiAgICB7XHJcbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKFwiY29udGV4dG1lbnVcIiwgZnVuY3Rpb24oZSkgXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgfSwgZmFsc2UpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIGFkZE1vdXNlSGFuZGxlcnNcclxufTtcclxuIiwidmFyIGdsb2JhbERhdGEgPSByZXF1aXJlKFwiLi9nbG9iYWwuanNcIik7XHJcbnZhciByZW5kZXIgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyLmpzXCIpO1xyXG52YXIgaXBjYiAgICAgICA9IHJlcXVpcmUoXCIuL2lwY2IuanNcIik7XHJcblxyXG5jb25zdCBib2FyZFJvdGF0aW9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib2FyZFJvdGF0aW9uXCIpO1xyXG5ib2FyZFJvdGF0aW9uLm9uaW5wdXQ9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICByZW5kZXIuU2V0Qm9hcmRSb3RhdGlvbihib2FyZFJvdGF0aW9uLnZhbHVlKTtcclxufTtcclxuXHJcbmNvbnN0IGRhcmtNb2RlQm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkYXJrbW9kZUNoZWNrYm94XCIpO1xyXG5kYXJrTW9kZUJveC5vbmNoYW5nZSA9IGZ1bmN0aW9uICgpIFxyXG57XHJcbiAgICBpcGNiLnNldERhcmtNb2RlKGRhcmtNb2RlQm94LmNoZWNrZWQpO1xyXG59O1xyXG5cclxuY29uc3Qgc2lsa3NjcmVlbkNoZWNrYm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaWxrc2NyZWVuQ2hlY2tib3hcIik7XHJcbnNpbGtzY3JlZW5DaGVja2JveC5jaGVja2VkPWZ1bmN0aW9uKClcclxue1xyXG4gICAgaXBjYi5zaWxrc2NyZWVuVmlzaWJsZShzaWxrc2NyZWVuQ2hlY2tib3guY2hlY2tlZCk7XHJcbn07XHJcblxyXG5zaWxrc2NyZWVuQ2hlY2tib3gub25jaGFuZ2U9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLnNpbGtzY3JlZW5WaXNpYmxlKHNpbGtzY3JlZW5DaGVja2JveC5jaGVja2VkKTtcclxufTtcclxuXHJcbmNvbnN0IGhpZ2hsaWdodHBpbjFDaGVja2JveCA9ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoaWdobGlnaHRwaW4xQ2hlY2tib3hcIik7XHJcbmhpZ2hsaWdodHBpbjFDaGVja2JveC5vbmNoYW5nZT1mdW5jdGlvbigpXHJcbntcclxuICAgIGdsb2JhbERhdGEuc2V0SGlnaGxpZ2h0UGluMShoaWdobGlnaHRwaW4xQ2hlY2tib3guY2hlY2tlZCk7XHJcbiAgICByZW5kZXIuZHJhd0NhbnZhcyhnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmZyb250KTtcclxuICAgIHJlbmRlci5kcmF3Q2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjayk7XHJcbn07XHJcblxyXG5jb25zdCBkcmFnQ2hlY2tib3ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRyYWdDaGVja2JveFwiKTtcclxuZHJhZ0NoZWNrYm94LmNoZWNrZWQ9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBnbG9iYWxEYXRhLnNldFJlZHJhd09uRHJhZyhkcmFnQ2hlY2tib3guY2hlY2tlZCk7XHJcbn07XHJcbmRyYWdDaGVja2JveC5vbmNoYW5nZT1mdW5jdGlvbigpXHJcbntcclxuICAgIGdsb2JhbERhdGEuc2V0UmVkcmF3T25EcmFnKGRyYWdDaGVja2JveC5jaGVja2VkKTtcclxufTtcclxuXHJcblxyXG5jb25zdCBjb21iaW5lVmFsdWVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb21iaW5lVmFsdWVzXCIpO1xyXG5jb21iaW5lVmFsdWVzLm9uY2hhbmdlPWZ1bmN0aW9uKClcclxue1xyXG4gICAgZ2xvYmFsRGF0YS5zZXRDb21iaW5lVmFsdWVzKGNvbWJpbmVWYWx1ZXMuY2hlY2tlZCk7XHJcbiAgICBpcGNiLnBvcHVsYXRlQm9tVGFibGUoKTtcclxufTtcclxuXHJcblxyXG5jb25zdCBoaWRlUGxhY2VkUGFydHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhpZGVQbGFjZWRQYXJ0c1wiKTtcclxuaGlkZVBsYWNlZFBhcnRzLm9uY2hhbmdlPWZ1bmN0aW9uKClcclxue1xyXG4gICAgZ2xvYmFsRGF0YS5zZXRIaWRlUGxhY2VkUGFydHMoaGlkZVBsYWNlZFBhcnRzLmNoZWNrZWQpO1xyXG4gICAgaXBjYi5wb3B1bGF0ZUJvbVRhYmxlKCk7XHJcbn07XHJcblxyXG5jb25zdCBkZWJ1Z01vZGVCb3ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlYnVnTW9kZVwiKTtcclxuZGVidWdNb2RlQm94Lm9uY2hhbmdlPWZ1bmN0aW9uKClcclxue1xyXG4gICAgZ2xvYmFsRGF0YS5zZXREZWJ1Z01vZGUoZGVidWdNb2RlQm94LmNoZWNrZWQpO1xyXG4gICAgcmVuZGVyLmRyYXdDYW52YXMoZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5mcm9udCk7XHJcbiAgICByZW5kZXIuZHJhd0NhbnZhcyhnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xyXG59O1xyXG5cclxuXHJcblxyXG5cclxuY29uc3QgZmlsdGVyQk9NID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tZmlsdGVyXCIpO1xyXG5maWx0ZXJCT00ub25pbnB1dD1mdW5jdGlvbigpXHJcbntcclxuICAgIGlwY2Iuc2V0RmlsdGVyQk9NKGZpbHRlckJPTS52YWx1ZSk7XHJcbn07XHJcblxyXG5jb25zdCBjbGVhckZpbHRlckJPTSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXJCT01TZWFyY2hcIik7XHJcbmNsZWFyRmlsdGVyQk9NLm9uY2xpY2s9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBmaWx0ZXJCT00udmFsdWU9XCJcIjtcclxuICAgIGlwY2Iuc2V0RmlsdGVyQk9NKGZpbHRlckJPTS52YWx1ZSk7XHJcbn07XHJcblxyXG5jb25zdCBmaWx0ZXJMYXllciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5ZXItZmlsdGVyXCIpO1xyXG5maWx0ZXJMYXllci5vbmlucHV0PWZ1bmN0aW9uKClcclxue1xyXG4gICAgaXBjYi5zZXRGaWx0ZXJMYXllcihmaWx0ZXJMYXllci52YWx1ZSk7XHJcbn07XHJcblxyXG5jb25zdCBjbGVhckZpbHRlckxheWVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhckxheWVyU2VhcmNoXCIpO1xyXG5jbGVhckZpbHRlckxheWVyLm9uY2xpY2s9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBmaWx0ZXJMYXllci52YWx1ZT1cIlwiO1xyXG4gICAgaXBjYi5zZXRGaWx0ZXJMYXllcihmaWx0ZXJMYXllci52YWx1ZSk7XHJcbn07XHJcblxyXG5jb25zdCBib21DaGVja2JveGVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib21DaGVja2JveGVzXCIpO1xyXG5ib21DaGVja2JveGVzLm9uaW5wdXQ9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLnNldEJvbUNoZWNrYm94ZXMoYm9tQ2hlY2tib3hlcy52YWx1ZSk7XHJcbn07XHJcblxyXG5jb25zdCByZW1vdmVCT01FbnRyaWVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZW1vdmVCT01FbnRyaWVzXCIpO1xyXG5yZW1vdmVCT01FbnRyaWVzLm9uaW5wdXQ9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLnNldFJlbW92ZUJPTUVudHJpZXMocmVtb3ZlQk9NRW50cmllcy52YWx1ZSk7XHJcbn07XHJcblxyXG5jb25zdCBhZGRpdGlvbmFsQXR0cmlidXRlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWRkaXRpb25hbEF0dHJpYnV0ZXNcIik7XHJcbmFkZGl0aW9uYWxBdHRyaWJ1dGVzLm9uaW5wdXQ9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLnNldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKGFkZGl0aW9uYWxBdHRyaWJ1dGVzLnZhbHVlKTtcclxufTtcclxuXHJcbmNvbnN0IGZsX2J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmwtYnRuXCIpO1xyXG5mbF9idG4ub25jbGljaz1mdW5jdGlvbigpXHJcbntcclxuICAgIGlwY2IuY2hhbmdlQ2FudmFzTGF5b3V0KFwiRlwiKTtcclxufTtcclxuXHJcbmNvbnN0IGZiX2J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmItYnRuXCIpO1xyXG5mYl9idG4ub25jbGljaz1mdW5jdGlvbigpXHJcbntcclxuICAgIGlwY2IuY2hhbmdlQ2FudmFzTGF5b3V0KFwiRkJcIik7XHJcbn07XHJcblxyXG5jb25zdCBibF9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJsLWJ0blwiKTtcclxuYmxfYnRuLm9uY2xpY2s9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLmNoYW5nZUNhbnZhc0xheW91dChcIkJcIik7XHJcbn07XHJcblxyXG5jb25zdCBib21fYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tYnRuXCIpO1xyXG5ib21fYnRuLm9uY2xpY2s9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLmNoYW5nZUJvbUxheW91dChcIkJPTVwiKTtcclxufTtcclxuXHJcbmNvbnN0IGxyX2J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWxyLWJ0blwiKTtcclxubHJfYnRuLm9uY2xpY2s9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLmNoYW5nZUJvbUxheW91dChcIkxSXCIpO1xyXG59O1xyXG5cclxuY29uc3QgdGJfYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tdGItYnRuXCIpO1xyXG50Yl9idG4ub25jbGljaz1mdW5jdGlvbigpXHJcbntcclxuICAgIGlwY2IuY2hhbmdlQm9tTGF5b3V0KFwiVEJcIik7XHJcbn07XHJcblxyXG5jb25zdCBwY2JfYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwY2ItYnRuXCIpO1xyXG5wY2JfYnRuLm9uY2xpY2s9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLmNoYW5nZUJvbUxheW91dChcIlBDQlwiKTtcclxufTtcclxuXHJcbmNvbnN0IGxheV9idG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheS1idG5cIik7XHJcbmxheV9idG4ub25jbGljaz1mdW5jdGlvbigpXHJcbntcclxuICAgIGlwY2IudG9nZ2xlTGF5ZXJzKCk7XHJcbn07XHJcblxyXG5jb25zdCBmdWxsc2NyZWVuX2J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnVsbHNjcmVlbi1idG5cIik7XHJcbmZ1bGxzY3JlZW5fYnRuLm9uY2xpY2s9ZnVuY3Rpb24oKVxyXG57XHJcbiAgICBpcGNiLnRvZ2dsZUZ1bGxTY3JlZW4oKTtcclxufTtcclxuIiwiLyogRE9NIG1hbmlwdWxhdGlvbiBhbmQgbWlzYyBjb2RlICovXHJcblxyXG5cInVzZSBzdHJpY3RcIjtcclxudmFyIFNwbGl0ICAgICAgPSByZXF1aXJlKFwic3BsaXQuanNcIik7XHJcbnZhciBnbG9iYWxEYXRhID0gcmVxdWlyZShcIi4vZ2xvYmFsLmpzXCIpO1xyXG52YXIgcmVuZGVyICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlci5qc1wiKTtcclxudmFyIHBjYiAgICAgICAgPSByZXF1aXJlKFwiLi9wY2IuanNcIik7XHJcbnZhciBoYW5kbGVyc19tb3VzZSAgICA9IHJlcXVpcmUoXCIuL2hhbmRsZXJzX21vdXNlLmpzXCIpO1xyXG52YXIgdmVyc2lvbiAgICAgICAgICAgPSByZXF1aXJlKFwiLi92ZXJzaW9uLmpzXCIpO1xyXG52YXIgRnVsbHNjcmVlbiAgICAgICAgPSByZXF1aXJlKFwiLi9mdWxsc2NyZWVuLmpzXCIpO1xyXG5cclxuLy9UT0RPOiBHTE9CQUwgVkFSSUFCTEVTXHJcbmxldCBsYXllckJvZHkgPSB1bmRlZmluZWQ7XHJcbmxldCBsYXllckhlYWQgPSB1bmRlZmluZWQ7XHJcbmxldCBib21oZWFkICAgPSB1bmRlZmluZWQ7XHJcbmxldCBib20gPSB1bmRlZmluZWQ7XHJcbmxldCBib210YWJsZSA9IHVuZGVmaW5lZDtcclxuXHJcbi8vVE9ETzogIEdMT0JBTCBWQVJJQUJMRSBSRUZBQ1RPUlxyXG5sZXQgZmlsdGVyQk9NID0gXCJcIjtcclxuZnVuY3Rpb24gZ2V0RmlsdGVyQk9NKCkgXHJcbntcclxuICAgIHJldHVybiBmaWx0ZXJCT007XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldEZpbHRlckJPTShpbnB1dCkgXHJcbntcclxuICAgIGZpbHRlckJPTSA9IGlucHV0LnRvTG93ZXJDYXNlKCk7XHJcbiAgICBwb3B1bGF0ZUJvbVRhYmxlKCk7XHJcbn1cclxuXHJcblxyXG5sZXQgZmlsdGVyTGF5ZXIgPSBcIlwiO1xyXG5mdW5jdGlvbiBnZXRGaWx0ZXJMYXllcigpIFxyXG57XHJcbiAgICByZXR1cm4gZmlsdGVyTGF5ZXI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldEZpbHRlckxheWVyKGlucHV0KSBcclxue1xyXG4gICAgZmlsdGVyTGF5ZXIgPSBpbnB1dC50b0xvd2VyQ2FzZSgpO1xyXG4gICAgcG9wdWxhdGVMYXllclRhYmxlKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldERhcmtNb2RlKHZhbHVlKVxyXG57XHJcbiAgICBpZiAodmFsdWUpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IHRvcG1vc3RkaXYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRvcG1vc3RkaXZcIik7XHJcbiAgICAgICAgdG9wbW9zdGRpdi5jbGFzc0xpc3QuYWRkKFwiZGFya1wiKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBsZXQgdG9wbW9zdGRpdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidG9wbW9zdGRpdlwiKTtcclxuICAgICAgICB0b3Btb3N0ZGl2LmNsYXNzTGlzdC5yZW1vdmUoXCJkYXJrXCIpO1xyXG4gICAgfVxyXG4gICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJkYXJrbW9kZVwiLCB2YWx1ZSk7XHJcbiAgICByZW5kZXIuZHJhd0NhbnZhcyhnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmZyb250KTtcclxuICAgIHJlbmRlci5kcmF3Q2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjayk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUNoZWNrYm94Q2hhbmdlSGFuZGxlcihjaGVja2JveCwgYm9tZW50cnkpXHJcbntcclxuICAgIHJldHVybiBmdW5jdGlvbigpIFxyXG4gICAge1xyXG4gICAgICAgIGlmKGJvbWVudHJ5LmNoZWNrYm94ZXMuZ2V0KGNoZWNrYm94KSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGJvbWVudHJ5LmNoZWNrYm94ZXMuc2V0KGNoZWNrYm94LGZhbHNlKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJjaGVja2JveFwiICsgXCJfXCIgKyBjaGVja2JveC50b0xvd2VyQ2FzZSgpICsgXCJfXCIgKyBib21lbnRyeS5yZWZlcmVuY2UsIFwiZmFsc2VcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGJvbWVudHJ5LmNoZWNrYm94ZXMuc2V0KGNoZWNrYm94LHRydWUpO1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImNoZWNrYm94XCIgKyBcIl9cIiArIGNoZWNrYm94LnRvTG93ZXJDYXNlKCkgKyBcIl9cIiArIGJvbWVudHJ5LnJlZmVyZW5jZSwgXCJ0cnVlXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBTYXZlIGN1cnJlbnRseSBoaWdobGl0ZWQgcm93XHJcbiAgICAgICAgbGV0IHJvd2lkID0gZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpO1xyXG4gICAgICAgIC8vIFJlZHJhdyB0aGUgY2FudmFzXHJcbiAgICAgICAgcmVuZGVyLmRyYXdDYW52YXMoZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5mcm9udCk7XHJcbiAgICAgICAgcmVuZGVyLmRyYXdDYW52YXMoZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5iYWNrKTtcclxuICAgICAgICAvLyBSZWRyYXcgdGhlIEJPTSB0YWJsZVxyXG4gICAgICAgIHBvcHVsYXRlQm9tVGFibGUoKTtcclxuICAgICAgICAvLyBSZW5kZXIgY3VycmVudCByb3cgc28gaXRzIGhpZ2hsaWdodGVkXHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQocm93aWQpLmNsYXNzTGlzdC5hZGQoXCJoaWdobGlnaHRlZFwiKTtcclxuICAgICAgICAvLyBTZXQgY3VycmVudCBzZWxlY3RlZCByb3cgZ2xvYmFsIHZhcmlhYmxlXHJcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZChyb3dpZCk7XHJcbiAgICAgICAgLy8gSWYgaGlnaGxpZ2h0ZWQgdGhlbiBhIHNwZWNpYWwgY29sb3Igd2lsbCBiZSB1c2VkIGZvciB0aGUgcGFydC5cclxuICAgICAgICByZW5kZXIuZHJhd0hpZ2hsaWdodHMoSXNDaGVja2JveENsaWNrZWQoZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpLCBcInBsYWNlZFwiKSk7XHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVSb3dIaWdobGlnaHRIYW5kbGVyKHJvd2lkLCByZWZzKVxyXG57XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oKVxyXG4gICAge1xyXG4gICAgICAgIGlmIChnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpID09IHJvd2lkKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpKS5jbGFzc0xpc3QucmVtb3ZlKFwiaGlnaGxpZ2h0ZWRcIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChyb3dpZCkuY2xhc3NMaXN0LmFkZChcImhpZ2hsaWdodGVkXCIpO1xyXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQocm93aWQpO1xyXG4gICAgICAgIGdsb2JhbERhdGEuc2V0SGlnaGxpZ2h0ZWRSZWZzKHJlZnMpO1xyXG4gICAgICAgIC8vIElmIGhpZ2hsaWdodGVkIHRoZW4gYSBzcGVjaWFsIGNvbG9yIHdpbGwgYmUgdXNlZCBmb3IgdGhlIHBhcnQuXHJcbiAgICAgICAgcmVuZGVyLmRyYXdIaWdobGlnaHRzKElzQ2hlY2tib3hDbGlja2VkKGdsb2JhbERhdGEuZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKSwgXCJwbGFjZWRcIikpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBlbnRyeU1hdGNoZXMocGFydClcclxue1xyXG4gICAgLy8gY2hlY2sgcmVmc1xyXG4gICAgaWYgKHBhcnQucmVmZXJlbmNlLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihnZXRGaWx0ZXJCT00oKSkgPj0gMClcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIC8vIGNoZWNrIHZhbHVlXHJcbiAgICBpZiAocGFydC52YWx1ZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YoZ2V0RmlsdGVyQk9NKCkpPj0gMClcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH0gXHJcblxyXG4gICAgLy8gQ2hlY2sgdGhlIGRpc3BsYXllZCBhdHRyaWJ1dGVzXHJcbiAgICBsZXQgYWRkaXRpb25hbEF0dHJpYnV0ZXMgPSBnbG9iYWxEYXRhLmdldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKCkuc3BsaXQoXCIsXCIpO1xyXG4gICAgYWRkaXRpb25hbEF0dHJpYnV0ZXMgICAgID0gYWRkaXRpb25hbEF0dHJpYnV0ZXMuZmlsdGVyKGZ1bmN0aW9uKGUpe3JldHVybiBlO30pO1xyXG4gICAgZm9yIChsZXQgeCBvZiBhZGRpdGlvbmFsQXR0cmlidXRlcylcclxuICAgIHtcclxuICAgICAgICAvLyByZW1vdmUgYmVnaW5uaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXHJcbiAgICAgICAgeCA9IHgudHJpbSgpO1xyXG4gICAgICAgIGlmIChwYXJ0LmF0dHJpYnV0ZXMuaGFzKHgpKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYocGFydC5hdHRyaWJ1dGVzLmdldCh4KS5pbmRleE9mKGdldEZpbHRlckJPTSgpKSA+PSAwKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGVudHJ5TWF0Y2hlc0xheWVyKGxheWVyKSBcclxue1xyXG4gICAgLy8gY2hlY2sgcmVmc1xyXG4gICAgaWYgKGxheWVyLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKGdldEZpbHRlckxheWVyKCkpID49IDApIFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcbmZ1bmN0aW9uIGhpZ2hsaWdodEZpbHRlckxheWVyKHMpIFxyXG57XHJcbiAgICBpZiAoIWdldEZpbHRlckxheWVyKCkpIFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBzO1xyXG4gICAgfVxyXG4gICAgbGV0IHBhcnRzID0gcy50b0xvd2VyQ2FzZSgpLnNwbGl0KGdldEZpbHRlckxheWVyKCkpO1xyXG4gICAgaWYgKHBhcnRzLmxlbmd0aCA9PSAxKSBcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gcztcclxuICAgIH1cclxuICAgIGxldCByID0gXCJcIjtcclxuICAgIGxldCBwb3MgPSAwO1xyXG4gICAgZm9yIChsZXQgaSBpbiBwYXJ0cykgXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGkgPiAwKSBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHIgKz0gXCI8bWFyayBjbGFzcz1cXFwiaGlnaGxpZ2h0XFxcIj5cIiArIHMuc3Vic3RyaW5nKHBvcywgcG9zICsgZ2V0RmlsdGVyTGF5ZXIoKS5sZW5ndGgpICsgXCI8L21hcms+XCI7XHJcbiAgICAgICAgICAgIHBvcyArPSBnZXRGaWx0ZXJMYXllcigpLmxlbmd0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgciArPSBzLnN1YnN0cmluZyhwb3MsIHBvcyArIHBhcnRzW2ldLmxlbmd0aCk7XHJcbiAgICAgICAgcG9zICs9IHBhcnRzW2ldLmxlbmd0aDtcclxuICAgIH1cclxuICAgIHJldHVybiByO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gaGlnaGxpZ2h0RmlsdGVyKHMpXHJcbntcclxuICAgIGlmICghZ2V0RmlsdGVyQk9NKCkpIFxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBzO1xyXG4gICAgfVxyXG4gICAgbGV0IHBhcnRzID0gcy50b0xvd2VyQ2FzZSgpLnNwbGl0KGdldEZpbHRlckJPTSgpKTtcclxuICAgIGlmIChwYXJ0cy5sZW5ndGggPT0gMSlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gcztcclxuICAgIH1cclxuXHJcbiAgICBsZXQgciA9IFwiXCI7XHJcbiAgICBsZXQgcG9zID0gMDtcclxuICAgIGZvciAobGV0IGkgaW4gcGFydHMpXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKGkgPiAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgciArPSBcIjxtYXJrIGNsYXNzPVxcXCJoaWdobGlnaHRcXFwiPlwiICsgcy5zdWJzdHJpbmcocG9zLCBwb3MgKyBnZXRGaWx0ZXJCT00oKS5sZW5ndGgpICsgXCI8L21hcms+XCI7XHJcbiAgICAgICAgICAgIHBvcyArPSBnZXRGaWx0ZXJCT00oKS5sZW5ndGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHIgKz0gcy5zdWJzdHJpbmcocG9zLCBwb3MgKyBwYXJ0c1tpXS5sZW5ndGgpO1xyXG4gICAgICAgIHBvcyArPSBwYXJ0c1tpXS5sZW5ndGg7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcjtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQ29sdW1uSGVhZGVyKG5hbWUsIGNscywgY29tcGFyYXRvcilcclxue1xyXG4gICAgbGV0IHRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpO1xyXG4gICAgdGguaW5uZXJIVE1MID0gbmFtZTtcclxuICAgIHRoLmNsYXNzTGlzdC5hZGQoY2xzKTtcclxuICAgIHRoLnN0eWxlLmN1cnNvciA9IFwicG9pbnRlclwiO1xyXG4gICAgbGV0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiU1BBTlwiKTtcclxuICAgIHNwYW4uY2xhc3NMaXN0LmFkZChcInNvcnRtYXJrXCIpO1xyXG4gICAgc3Bhbi5jbGFzc0xpc3QuYWRkKFwibm9uZVwiKTtcclxuICAgIHRoLmFwcGVuZENoaWxkKHNwYW4pO1xyXG4gICAgdGgub25jbGljayA9IGZ1bmN0aW9uKClcclxuICAgIHtcclxuICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRDdXJyZW50U29ydENvbHVtbigpICYmIHRoaXMgIT09IGdsb2JhbERhdGEuZ2V0Q3VycmVudFNvcnRDb2x1bW4oKSkgXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBDdXJyZW50bHkgc29ydGVkIGJ5IGFub3RoZXIgY29sdW1uXHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZ2V0Q3VycmVudFNvcnRDb2x1bW4oKS5jaGlsZE5vZGVzWzFdLmNsYXNzTGlzdC5yZW1vdmUoZ2xvYmFsRGF0YS5nZXRDdXJyZW50U29ydE9yZGVyKCkpO1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLmdldEN1cnJlbnRTb3J0Q29sdW1uKCkuY2hpbGROb2Rlc1sxXS5jbGFzc0xpc3QuYWRkKFwibm9uZVwiKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDdXJyZW50U29ydENvbHVtbihudWxsKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDdXJyZW50U29ydE9yZGVyKG51bGwpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0Q3VycmVudFNvcnRDb2x1bW4oKSAmJiB0aGlzID09PSBnbG9iYWxEYXRhLmdldEN1cnJlbnRTb3J0Q29sdW1uKCkpIFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gQWxyZWFkeSBzb3J0ZWQgYnkgdGhpcyBjb2x1bW5cclxuICAgICAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0Q3VycmVudFNvcnRPcmRlcigpID09IFwiYXNjXCIpIFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBTb3J0IGJ5IHRoaXMgY29sdW1uLCBkZXNjZW5kaW5nIG9yZGVyXHJcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLnNldEJvbVNvcnRGdW5jdGlvbihmdW5jdGlvbihhLCBiKSBcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gLWNvbXBhcmF0b3IoYSwgYik7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuZ2V0Q3VycmVudFNvcnRDb2x1bW4oKS5jaGlsZE5vZGVzWzFdLmNsYXNzTGlzdC5yZW1vdmUoXCJhc2NcIik7XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLmdldEN1cnJlbnRTb3J0Q29sdW1uKCkuY2hpbGROb2Rlc1sxXS5jbGFzc0xpc3QuYWRkKFwiZGVzY1wiKTtcclxuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Q3VycmVudFNvcnRPcmRlcihcImRlc2NcIik7XHJcbiAgICAgICAgICAgIH0gXHJcbiAgICAgICAgICAgIGVsc2UgXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIC8vIFVuc29ydFxyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21Tb3J0RnVuY3Rpb24obnVsbCk7XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLmdldEN1cnJlbnRTb3J0Q29sdW1uKCkuY2hpbGROb2Rlc1sxXS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVzY1wiKTtcclxuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuZ2V0Q3VycmVudFNvcnRDb2x1bW4oKS5jaGlsZE5vZGVzWzFdLmNsYXNzTGlzdC5hZGQoXCJub25lXCIpO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDdXJyZW50U29ydENvbHVtbihudWxsKTtcclxuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Q3VycmVudFNvcnRPcmRlcihudWxsKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBTb3J0IGJ5IHRoaXMgY29sdW1uLCBhc2NlbmRpbmcgb3JkZXJcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21Tb3J0RnVuY3Rpb24oY29tcGFyYXRvcik7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Q3VycmVudFNvcnRDb2x1bW4odGhpcyk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZ2V0Q3VycmVudFNvcnRDb2x1bW4oKS5jaGlsZE5vZGVzWzFdLmNsYXNzTGlzdC5yZW1vdmUoXCJub25lXCIpO1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLmdldEN1cnJlbnRTb3J0Q29sdW1uKCkuY2hpbGROb2Rlc1sxXS5jbGFzc0xpc3QuYWRkKFwiYXNjXCIpO1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldEN1cnJlbnRTb3J0T3JkZXIoXCJhc2NcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHBvcHVsYXRlQm9tQm9keSgpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoO1xyXG59XHJcblxyXG4vLyBEZXNjcmliZXMgaG93IHRvIHNvcnQgY2hlY2tib3hlc1xyXG5mdW5jdGlvbiBDaGVja2JveENvbXBhcmUoc3RyaW5nTmFtZSlcclxue1xyXG4gICAgcmV0dXJuIChwYXJ0QSwgcGFydEIpID0+IHtcclxuICAgICAgICBpZiAocGFydEEuY2hlY2tib3hlcy5nZXQoc3RyaW5nTmFtZSkgJiYgIXBhcnRCLmNoZWNrYm94ZXMuZ2V0KHN0cmluZ05hbWUpKSBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiAgMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoIXBhcnRBLmNoZWNrYm94ZXMuZ2V0KHN0cmluZ05hbWUpICYmIHBhcnRCLmNoZWNrYm94ZXMuZ2V0KHN0cmluZ05hbWUpKSBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiAtMTtcclxuICAgICAgICB9IFxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gRGVzY3JpYmVzIGhvZSB0byBzb3J0IGJ5IGF0dHJpYnV0ZXNcclxuZnVuY3Rpb24gQXR0cmlidXRlQ29tcGFyZShzdHJpbmdOYW1lKVxyXG57XHJcbiAgICByZXR1cm4gKHBhcnRBLCBwYXJ0QikgPT4ge1xyXG4gICAgICAgIGlmIChwYXJ0QS5hdHRyaWJ1dGVzLmdldChzdHJpbmdOYW1lKSAhPSBwYXJ0Qi5hdHRyaWJ1dGVzLmdldChzdHJpbmdOYW1lKSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiAgcGFydEEuYXR0cmlidXRlcy5nZXQoc3RyaW5nTmFtZSkgPiBwYXJ0Qi5hdHRyaWJ1dGVzLmdldChzdHJpbmdOYW1lKSA/IDEgOiAtMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwb3B1bGF0ZUxheWVySGVhZGVyKClcclxue1xyXG4gICAgd2hpbGUgKGxheWVySGVhZC5maXJzdENoaWxkKSBcclxuICAgIHtcclxuICAgICAgICBsYXllckhlYWQucmVtb3ZlQ2hpbGQobGF5ZXJIZWFkLmZpcnN0Q2hpbGQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEhlYWRlciByb3dcclxuICAgIGxldCB0ciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUUlwiKTtcclxuICAgIC8vIERlZmluZXMgdGhlXHJcbiAgICBsZXQgdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7XHJcblxyXG4gICAgdGguY2xhc3NMaXN0LmFkZChcInZpc2lhYmxlQ29sXCIpO1xyXG5cclxuICAgIGxldCB0cjIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVFJcIik7XHJcbiAgICBsZXQgdGhmID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpO1xyXG4gICAgbGV0IHRoYiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJUSFwiKTtcclxuXHJcbiAgICB0aGYuaW5uZXJIVE1MID0gXCJGcm9udFwiXHJcbiAgICB0aGIuaW5uZXJIVE1MID0gXCJCYWNrXCJcclxuICAgIHRyMi5hcHBlbmRDaGlsZCh0aGYpXHJcbiAgICB0cjIuYXBwZW5kQ2hpbGQodGhiKVxyXG5cclxuICAgIHRoLmlubmVySFRNTCA9IFwiVmlzaWJsZVwiO1xyXG4gICAgdGguY29sU3BhbiA9IDJcclxuICAgIGxldCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlNQQU5cIik7XHJcbiAgICBzcGFuLmNsYXNzTGlzdC5hZGQoXCJub25lXCIpO1xyXG4gICAgdGguYXBwZW5kQ2hpbGQoc3Bhbik7XHJcbiAgICB0ci5hcHBlbmRDaGlsZCh0aCk7XHJcblxyXG4gICAgdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVEhcIik7XHJcbiAgICB0aC5pbm5lckhUTUwgPSBcIkxheWVyXCI7XHJcbiAgICB0aC5yb3dTcGFuID0gMjtcclxuICAgIHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiU1BBTlwiKTtcclxuICAgIHNwYW4uY2xhc3NMaXN0LmFkZChcIm5vbmVcIik7XHJcbiAgICB0aC5hcHBlbmRDaGlsZChzcGFuKTtcclxuICAgIHRyLmFwcGVuZENoaWxkKHRoKTtcclxuXHJcbiAgICBsYXllckhlYWQuYXBwZW5kQ2hpbGQodHIpO1xyXG4gICAgbGF5ZXJIZWFkLmFwcGVuZENoaWxkKHRyMik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUxheWVyQ2hlY2tib3hDaGFuZ2VIYW5kbGVyKGxheWVyRW50cnksIGlzRnJvbnQpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbigpIFxyXG4gICAge1xyXG4gICAgICAgIGlmKGlzRnJvbnQpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBpZihsYXllckVudHJ5LnZpc2libGVfZnJvbnQpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHBjYi5TZXRMYXllclZpc2liaWxpdHkobGF5ZXJFbnRyeS5uYW1lLCBpc0Zyb250LCBmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImNoZWNrYm94X2xheWVyX2Zyb250X1wiICsgbGF5ZXJFbnRyeS5uYW1lICsgXCJfdmlzaWJsZVwiLCBcImZhbHNlXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcGNiLlNldExheWVyVmlzaWJpbGl0eShsYXllckVudHJ5Lm5hbWUsIGlzRnJvbnQsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJjaGVja2JveF9sYXllcl9mcm9udF9cIiArIGxheWVyRW50cnkubmFtZSArIFwiX3Zpc2libGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmKGxheWVyRW50cnkudmlzaWJsZV9iYWNrKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBwY2IuU2V0TGF5ZXJWaXNpYmlsaXR5KGxheWVyRW50cnkubmFtZSwgaXNGcm9udCwgZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJjaGVja2JveF9sYXllcl9iYWNrX1wiICsgbGF5ZXJFbnRyeS5uYW1lICsgXCJfdmlzaWJsZVwiLCBcImZhbHNlXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcGNiLlNldExheWVyVmlzaWJpbGl0eShsYXllckVudHJ5Lm5hbWUsIGlzRnJvbnQsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJjaGVja2JveF9sYXllcl9iYWNrX1wiICsgbGF5ZXJFbnRyeS5uYW1lICsgXCJfdmlzaWJsZVwiLCBcInRydWVcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBwb3B1bGF0ZUxheWVyQm9keSgpIFxyXG57XHJcbiAgICB3aGlsZSAobGF5ZXJCb2R5LmZpcnN0Q2hpbGQpIFxyXG4gICAge1xyXG4gICAgICAgIGxheWVyQm9keS5yZW1vdmVDaGlsZChsYXllckJvZHkuZmlyc3RDaGlsZCk7XHJcbiAgICB9XHJcbiAgICBsZXQgbGF5ZXJ0YWJsZSA9ICBwY2IuR2V0TGF5ZXJzKCk7XHJcblxyXG4gICAgLy8gcmVtb3ZlIGVudHJpZXMgdGhhdCBkbyBub3QgbWF0Y2ggZmlsdGVyXHJcbiAgICBmb3IgKGxldCBpIG9mIGxheWVydGFibGUpIFxyXG4gICAge1xyXG5cclxuICAgICAgICBpZiAoZ2V0RmlsdGVyTGF5ZXIoKSAhPSBcIlwiKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYoIWVudHJ5TWF0Y2hlc0xheWVyKGkpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHRyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRSXCIpO1xyXG4gICAgICAgIGxldCB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcclxuICAgICAgICBsZXQgaW5wdXRfZnJvbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XHJcbiAgICAgICAgbGV0IGlucHV0X2JhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XHJcbiAgICAgICAgaW5wdXRfZnJvbnQudHlwZSA9IFwiY2hlY2tib3hcIjtcclxuICAgICAgICBpbnB1dF9iYWNrLnR5cGUgPSBcImNoZWNrYm94XCI7XHJcbiAgICAgICAgLy8gQXNzdW1lcyB0aGF0IGFsbCBsYXllcnMgYXJlIHZpc2libGUgYnkgZGVmYXVsdC5cclxuICAgICAgICBpZiAoICAgIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKCBcImNoZWNrYm94X2xheWVyX2Zyb250X1wiICsgaS5uYW1lICsgXCJfdmlzaWJsZVwiICkgPT0gXCJ0cnVlXCIpXHJcbiAgICAgICAgICAgICB8fCAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZSggXCJjaGVja2JveF9sYXllcl9mcm9udF9cIiArIGkubmFtZSArIFwiX3Zpc2libGVcIiApID09IG51bGwpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGNiLlNldExheWVyVmlzaWJpbGl0eShpLm5hbWUsIHRydWUsIHRydWUpO1xyXG4gICAgICAgICAgICBpbnB1dF9mcm9udC5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGNiLlNldExheWVyVmlzaWJpbGl0eShpLm5hbWUsIHRydWUsIGZhbHNlKTtcclxuICAgICAgICAgICAgaW5wdXRfZnJvbnQuY2hlY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcblxyXG4gICAgICAgIGlmICggICAgKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hfbGF5ZXJfYmFja19cIiArIGkubmFtZSArIFwiX3Zpc2libGVcIiApID09IFwidHJ1ZVwiKVxyXG4gICAgICAgICAgICAgfHwgKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hfbGF5ZXJfYmFja19cIiArIGkubmFtZSArIFwiX3Zpc2libGVcIiApID09IG51bGwpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGNiLlNldExheWVyVmlzaWJpbGl0eShpLm5hbWUsIGZhbHNlLCB0cnVlKTtcclxuICAgICAgICAgICAgaW5wdXRfYmFjay5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcGNiLlNldExheWVyVmlzaWJpbGl0eShpLm5hbWUsIGZhbHNlLCBmYWxzZSk7XHJcbiAgICAgICAgICAgIGlucHV0X2JhY2suY2hlY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgXHJcbiAgICAgICAgaW5wdXRfZnJvbnQub25jaGFuZ2UgPSBjcmVhdGVMYXllckNoZWNrYm94Q2hhbmdlSGFuZGxlcihpLCB0cnVlKTtcclxuICAgICAgICBpbnB1dF9iYWNrLm9uY2hhbmdlICA9IGNyZWF0ZUxheWVyQ2hlY2tib3hDaGFuZ2VIYW5kbGVyKGksIGZhbHNlKTtcclxuICAgICAgICB0ZC5hcHBlbmRDaGlsZChpbnB1dF9mcm9udCk7XHJcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xyXG5cclxuICAgICAgICB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcclxuICAgICAgICB0ZC5hcHBlbmRDaGlsZChpbnB1dF9iYWNrKTtcclxuICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZCk7XHJcblxyXG4gICAgICAgIC8vIExheWVyXHJcbiAgICAgICAgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVERcIik7XHJcbiAgICAgICAgdGQuaW5uZXJIVE1MID1oaWdobGlnaHRGaWx0ZXJMYXllcihpLm5hbWUpO1xyXG4gICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcclxuICAgICAgICBcclxuICAgICAgICBsYXllcmJvZHkuYXBwZW5kQ2hpbGQodHIpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwb3B1bGF0ZUJvbUhlYWRlcigpIFxyXG57XHJcbiAgICB3aGlsZSAoYm9taGVhZC5maXJzdENoaWxkKVxyXG4gICAge1xyXG4gICAgICAgIGJvbWhlYWQucmVtb3ZlQ2hpbGQoYm9taGVhZC5maXJzdENoaWxkKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbGV0IHRyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRSXCIpO1xyXG4gICAgbGV0IHRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlRIXCIpO1xyXG4gICAgdGguY2xhc3NMaXN0LmFkZChcIm51bUNvbFwiKTtcclxuICAgIHRyLmFwcGVuZENoaWxkKHRoKTtcclxuXHJcblxyXG4gICAgbGV0IGFkZGl0aW9uYWxDaGVja2JveGVzID0gZ2xvYmFsRGF0YS5nZXRCb21DaGVja2JveGVzKCkuc3BsaXQoXCIsXCIpO1xyXG4gICAgYWRkaXRpb25hbENoZWNrYm94ZXMgICAgID0gYWRkaXRpb25hbENoZWNrYm94ZXMuZmlsdGVyKGZ1bmN0aW9uKGUpe3JldHVybiBlfSk7XHJcbiAgICBnbG9iYWxEYXRhLnNldENoZWNrYm94ZXMoYWRkaXRpb25hbENoZWNrYm94ZXMpO1xyXG4gICAgZm9yIChsZXQgeDIgb2YgYWRkaXRpb25hbENoZWNrYm94ZXMpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gcmVtb3ZlIGJlZ2lubmluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxyXG4gICAgICAgIHgyID0geDIudHJpbSgpXHJcbiAgICAgICAgaWYgKHgyKSBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRyLmFwcGVuZENoaWxkKGNyZWF0ZUNvbHVtbkhlYWRlcih4MiwgXCJDaGVja2JveGVzXCIsIENoZWNrYm94Q29tcGFyZSh4MikpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdHIuYXBwZW5kQ2hpbGQoY3JlYXRlQ29sdW1uSGVhZGVyKFwiUmVmZXJlbmNlc1wiLCBcIlJlZmVyZW5jZXNcIiwgKHBhcnRBLCBwYXJ0QikgPT4ge1xyXG4gICAgICAgIGlmIChwYXJ0QS5yZWZlcmVuY2UgIT0gcGFydEIucmVmZXJlbmNlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcnRBLnJlZmVyZW5jZSA+IHBhcnRCLnJlZmVyZW5jZSA/IDEgOiAtMTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG4gICAgfSkpO1xyXG5cclxuICAgIHRyLmFwcGVuZENoaWxkKGNyZWF0ZUNvbHVtbkhlYWRlcihcIlZhbHVlXCIsIFwiVmFsdWVcIiwgKHBhcnRBLCBwYXJ0QikgPT4ge1xyXG4gICAgICAgIGlmIChwYXJ0QS52YWx1ZSAhPSBwYXJ0Qi52YWx1ZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJ0QS52YWx1ZSA+IHBhcnRCLnZhbHVlID8gMSA6IC0xO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXR1cm4gMDtcclxuICAgICAgICB9XHJcbiAgICB9KSk7XHJcblxyXG4gICAgbGV0IGFkZGl0aW9uYWxBdHRyaWJ1dGVzID0gZ2xvYmFsRGF0YS5nZXRBZGRpdGlvbmFsQXR0cmlidXRlcygpLnNwbGl0KFwiLFwiKTtcclxuICAgIC8vIFJlbW92ZSBudWxsLCBcIlwiLCB1bmRlZmluZWQsIGFuZCAwIHZhbHVlc1xyXG4gICAgYWRkaXRpb25hbEF0dHJpYnV0ZXMgICAgPWFkZGl0aW9uYWxBdHRyaWJ1dGVzLmZpbHRlcihmdW5jdGlvbihlKXtyZXR1cm4gZX0pO1xyXG4gICAgZm9yIChsZXQgeCBvZiBhZGRpdGlvbmFsQXR0cmlidXRlcylcclxuICAgIHtcclxuICAgICAgICAvLyByZW1vdmUgYmVnaW5uaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXHJcbiAgICAgICAgeCA9IHgudHJpbSgpXHJcbiAgICAgICAgaWYgKHgpIFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdHIuYXBwZW5kQ2hpbGQoY3JlYXRlQ29sdW1uSGVhZGVyKHgsIFwiQXR0cmlidXRlc1wiLCBBdHRyaWJ1dGVDb21wYXJlKHgpKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmKGdsb2JhbERhdGEuZ2V0Q29tYmluZVZhbHVlcygpKVxyXG4gICAge1xyXG4gICAgICAgICAgICAvL1hYWDogVGhpcyBjb21wYXJpc29uIGZ1bmN0aW9uIGlzIHVzaW5nIHBvc2l0aXZlIGFuZCBuZWdhdGl2ZSBpbXBsaWNpdFxyXG4gICAgICAgICAgICB0ci5hcHBlbmRDaGlsZChjcmVhdGVDb2x1bW5IZWFkZXIoXCJRdWFudGl0eVwiLCBcIlF1YW50aXR5XCIsIChwYXJ0QSwgcGFydEIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcnRBLnF1YW50aXR5IC0gcGFydEIucXVhbnRpdHk7XHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBib21oZWFkLmFwcGVuZENoaWxkKHRyKTtcclxuXHJcbn1cclxuXHJcblxyXG5cclxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cclxuLy8gRmlsdGVyIGZ1bmN0aW9ucyBhcmUgZGVmaW5lZCBoZXJlLiBUaGVzZSBsZXQgdGhlIGFwcGxpY2F0aW9uIGZpbHRlciBcclxuLy8gZWxlbWVudHMgb3V0IG9mIHRoZSBjb21wbGV0ZSBib20uIFxyXG4vL1xyXG4vLyBUaGUgZmlsdGVyaW5nIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gdHJ1ZSBpZiB0aGUgcGFydCBzaG91bGQgYmUgZmlsdGVyZWQgb3V0XHJcbi8vIG90aGVyd2lzZSBpdCByZXR1cm5zIGZhbHNlXHJcbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXHJcbmZ1bmN0aW9uIEdldEJPTUZvclNpZGVPZkJvYXJkKGxvY2F0aW9uKVxyXG57XHJcbiAgICBsZXQgcmVzdWx0ID0gcGNiLkdldEJPTSgpO1xyXG4gICAgc3dpdGNoIChsb2NhdGlvbilcclxuICAgIHtcclxuICAgIGNhc2UgXCJGXCI6XHJcbiAgICAgICAgcmVzdWx0ID0gcGNiLmZpbHRlckJPTVRhYmxlKHJlc3VsdCwgZmlsdGVyQk9NX0Zyb250KTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJCXCI6XHJcbiAgICAgICAgcmVzdWx0ID0gcGNiLmZpbHRlckJPTVRhYmxlKHJlc3VsdCwgZmlsdGVyQk9NX0JhY2spO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpbHRlckJPTV9Gcm9udChwYXJ0KVxyXG57XHJcbiAgICBsZXQgcmVzdWx0ID0gdHJ1ZTtcclxuICAgIGlmKHBhcnQubG9jYXRpb24gPT0gXCJGXCIpXHJcbiAgICB7XHJcbiAgICAgICAgcmVzdWx0ID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaWx0ZXJCT01fQmFjayhwYXJ0KVxyXG57XHJcbiAgICBsZXQgcmVzdWx0ID0gdHJ1ZTtcclxuICAgIGlmKHBhcnQubG9jYXRpb24gPT0gXCJCXCIpXHJcbiAgICB7XHJcbiAgICAgICAgcmVzdWx0ID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaWx0ZXJCT01fQnlBdHRyaWJ1dGUocGFydClcclxue1xyXG4gICAgbGV0IHJlc3VsdCA9IGZhbHNlO1xyXG4gICAgbGV0IHNwbGl0RmlsdGVyU3RyaW5nID0gZ2xvYmFsRGF0YS5nZXRSZW1vdmVCT01FbnRyaWVzKCkuc3BsaXQoXCIsXCIpO1xyXG4gICAgLy8gUmVtb3ZlIG51bGwsIFwiXCIsIHVuZGVmaW5lZCwgYW5kIDAgdmFsdWVzXHJcbiAgICBzcGxpdEZpbHRlclN0cmluZyAgICA9IHNwbGl0RmlsdGVyU3RyaW5nLmZpbHRlcihmdW5jdGlvbihlKXtyZXR1cm4gZX0pO1xyXG5cclxuICAgIGlmKHNwbGl0RmlsdGVyU3RyaW5nLmxlbmd0aCA+IDAgKVxyXG4gICAge1xyXG4gICAgICAgIGZvcihsZXQgaSBvZiBzcGxpdEZpbHRlclN0cmluZylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIHJlbW92aW5nIGJlZ2lubmluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxyXG4gICAgICAgICAgICBpID0gaS50cmltKClcclxuICAgICAgICAgICAgZm9yIChsZXQgdmFsdWUgb2YgcGFydC5hdHRyaWJ1dGVzLnZhbHVlcygpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBJZCB0aGUgdmFsdWUgaXMgYW4gZW1wdHkgc3RyaW5nIHRoZW4gZG9udCBmaWx0ZXIgb3V0IHRoZSBlbnRyeS4gXHJcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGUgdmFsdWUgaXMgYW55dGhpbmcgdGhlbiBmaWx0ZXIgb3V0IHRoZSBib20gZW50cnlcclxuICAgICAgICAgICAgICAgIGlmKHZhbHVlICE9IFwiXCIpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYodmFsdWUgPT0gaSlcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xyXG5cclxuZnVuY3Rpb24gR2VuZXJhdGVCT01UYWJsZSgpXHJcbntcclxuICAgIC8vIEdldCBib20gdGFibGUgd2l0aCBlbGVtZW50cyBmb3IgdGhlIHNpZGUgb2YgYm9hcmQgdGhlIHVzZXIgaGFzIHNlbGVjdGVkXHJcbiAgICBsZXQgYm9tdGFibGVUZW1wID0gR2V0Qk9NRm9yU2lkZU9mQm9hcmQoZ2xvYmFsRGF0YS5nZXRDYW52YXNMYXlvdXQoKSk7XHJcblxyXG4gICAgLy8gQXBwbHkgYXR0cmlidXRlIGZpbHRlciB0byBib2FyZFxyXG4gICAgYm9tdGFibGVUZW1wID0gcGNiLmZpbHRlckJPTVRhYmxlKGJvbXRhYmxlVGVtcCwgZmlsdGVyQk9NX0J5QXR0cmlidXRlKTtcclxuXHJcbiAgICAvLyBJZiB0aGUgcGFydHMgYXJlIGRpc3BsYXllZCBvbmUgcGVyIGxpbmUgKG5vdCBjb21iaW5lZCB2YWx1ZXMpLCB0aGVuIHRoZSB0aGUgYm9tIHRhYmxlIG5lZWRzIHRvIGJlIGZsYXR0ZW5lZC4gXHJcbiAgICAvLyBCeSBkZWZhdWx0IHRoZSBkYXRhIGluIHRoZSBqc29uIGZpbGUgaXMgY29tYmluZWRcclxuICAgIGJvbXRhYmxlID0gZ2xvYmFsRGF0YS5nZXRDb21iaW5lVmFsdWVzKCkgPyBwY2IuR2V0Qk9NQ29tYmluZWRWYWx1ZXMoYm9tdGFibGVUZW1wKSA6IGJvbXRhYmxlVGVtcDtcclxuXHJcbiAgICByZXR1cm4gYm9tdGFibGU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBvcHVsYXRlQm9tQm9keSgpXHJcbntcclxuICAgIHdoaWxlIChib20uZmlyc3RDaGlsZClcclxuICAgIHtcclxuICAgICAgICBib20ucmVtb3ZlQ2hpbGQoYm9tLmZpcnN0Q2hpbGQpO1xyXG4gICAgfVxyXG5cclxuICAgIGdsb2JhbERhdGEuc2V0SGlnaGxpZ2h0SGFuZGxlcnMoW10pO1xyXG4gICAgZ2xvYmFsRGF0YS5zZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZChudWxsKTtcclxuICAgIGxldCBmaXJzdCA9IHRydWU7XHJcblxyXG4gICAgYm9tdGFibGUgPSBHZW5lcmF0ZUJPTVRhYmxlKCk7XHJcblxyXG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tU29ydEZ1bmN0aW9uKCkpXHJcbiAgICB7XHJcbiAgICAgICAgYm9tdGFibGUgPSBib210YWJsZS5zbGljZSgpLnNvcnQoZ2xvYmFsRGF0YS5nZXRCb21Tb3J0RnVuY3Rpb24oKSk7XHJcbiAgICB9XHJcbiAgICBmb3IgKGxldCBpIGluIGJvbXRhYmxlKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBib21lbnRyeSA9IGJvbXRhYmxlW2ldO1xyXG4gICAgICAgIGxldCByZWZlcmVuY2VzID0gYm9tZW50cnkucmVmZXJlbmNlO1xyXG5cclxuICAgICAgICAvLyByZW1vdmUgZW50cmllcyB0aGF0IGRvIG5vdCBtYXRjaCBmaWx0ZXJcclxuICAgICAgICBpZiAoZ2V0RmlsdGVyQk9NKCkgIT0gXCJcIilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmKCFlbnRyeU1hdGNoZXMoYm9tZW50cnkpKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGlkZSBwbGFjZWQgcGFydHMgb3B0aW9uIGlzIHNldFxyXG4gICAgICAgIGlmKGdsb2JhbERhdGEuZ2V0SGlkZVBsYWNlZFBhcnRzKCkpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZW50cmllcyB0aGF0IGhhdmUgYmVlbiBwbGFjZWQuIENoZWNrIHRoZSBwbGFjZWQgcGFyYW1ldGVyXHJcbiAgICAgICAgICAgIGlmKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hcIiArIFwiX1wiICsgXCJwbGFjZWRcIiArIFwiX1wiICsgYm9tZW50cnkucmVmZXJlbmNlICkgPT0gXCJ0cnVlXCIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdHIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVFJcIik7XHJcbiAgICAgICAgbGV0IHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIlREXCIpO1xyXG4gICAgICAgIGxldCByb3dudW0gPSAraSArIDE7XHJcbiAgICAgICAgdHIuaWQgPSBcImJvbXJvd1wiICsgcm93bnVtO1xyXG4gICAgICAgIHRkLnRleHRDb250ZW50ID0gcm93bnVtO1xyXG4gICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2tib3hlc1xyXG4gICAgICAgIGxldCBhZGRpdGlvbmFsQ2hlY2tib3hlcyA9IGdsb2JhbERhdGEuZ2V0Qm9tQ2hlY2tib3hlcygpLnNwbGl0KFwiLFwiKTtcclxuICAgICAgICBmb3IgKGxldCBjaGVja2JveCBvZiBhZGRpdGlvbmFsQ2hlY2tib3hlcykgXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjaGVja2JveCA9IGNoZWNrYm94LnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKGNoZWNrYm94KSBcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVERcIik7XHJcbiAgICAgICAgICAgICAgICBsZXQgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XHJcbiAgICAgICAgICAgICAgICBpbnB1dC50eXBlID0gXCJjaGVja2JveFwiO1xyXG4gICAgICAgICAgICAgICAgaW5wdXQub25jaGFuZ2UgPSBjcmVhdGVDaGVja2JveENoYW5nZUhhbmRsZXIoY2hlY2tib3gsIGJvbWVudHJ5KTtcclxuICAgICAgICAgICAgICAgIC8vIHJlYWQgdGhlIHZhbHVlIGluIGZyb20gbG9jYWwgc3RvcmFnZVxyXG5cclxuICAgICAgICAgICAgICAgIGlmKGdsb2JhbERhdGEucmVhZFN0b3JhZ2UoIFwiY2hlY2tib3hcIiArIFwiX1wiICsgY2hlY2tib3gudG9Mb3dlckNhc2UoKSArIFwiX1wiICsgYm9tZW50cnkucmVmZXJlbmNlICkgPT0gXCJ0cnVlXCIpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgYm9tZW50cnkuY2hlY2tib3hlcy5zZXQoY2hlY2tib3gsdHJ1ZSlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBib21lbnRyeS5jaGVja2JveGVzLnNldChjaGVja2JveCxmYWxzZSlcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZihib21lbnRyeS5jaGVja2JveGVzLmdldChjaGVja2JveCkpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5wdXQuY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5wdXQuY2hlY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHRkLmFwcGVuZENoaWxkKGlucHV0KTtcclxuICAgICAgICAgICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcblxyXG5cclxuICAgICAgICAvL0lORk86IFRoZSBsaW5lcyBiZWxvdyBhZGQgdGhlIGNvbnRyb2wgdGhlIGNvbHVtbnMgb24gdGhlIGJvbSB0YWJsZVxyXG4gICAgICAgIC8vIFJlZmVyZW5jZXNcclxuICAgICAgICB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcclxuICAgICAgICB0ZC5pbm5lckhUTUwgPSBoaWdobGlnaHRGaWx0ZXIocmVmZXJlbmNlcyk7XHJcbiAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xyXG4gICAgICAgIC8vIFZhbHVlXHJcbiAgICAgICAgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVERcIik7XHJcbiAgICAgICAgdGQuaW5uZXJIVE1MID0gaGlnaGxpZ2h0RmlsdGVyKGJvbWVudHJ5LnZhbHVlKTtcclxuICAgICAgICB0ci5hcHBlbmRDaGlsZCh0ZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQXR0cmlidXRlc1xyXG4gICAgICAgIGxldCBhZGRpdGlvbmFsQXR0cmlidXRlcyA9IGdsb2JhbERhdGEuZ2V0QWRkaXRpb25hbEF0dHJpYnV0ZXMoKS5zcGxpdChcIixcIik7XHJcbiAgICAgICAgZm9yIChsZXQgeCBvZiBhZGRpdGlvbmFsQXR0cmlidXRlcylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHggPSB4LnRyaW0oKVxyXG4gICAgICAgICAgICBpZiAoeClcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgdGQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiVERcIik7XHJcbiAgICAgICAgICAgICAgICB0ZC5pbm5lckhUTUwgPSBoaWdobGlnaHRGaWx0ZXIocGNiLmdldEF0dHJpYnV0ZVZhbHVlKGJvbWVudHJ5LCB4LnRvTG93ZXJDYXNlKCkpKTtcclxuICAgICAgICAgICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYoZ2xvYmFsRGF0YS5nZXRDb21iaW5lVmFsdWVzKCkpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0ZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJURFwiKTtcclxuICAgICAgICAgICAgdGQudGV4dENvbnRlbnQgPSBib21lbnRyeS5xdWFudGl0eTtcclxuICAgICAgICAgICAgdHIuYXBwZW5kQ2hpbGQodGQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBib20uYXBwZW5kQ2hpbGQodHIpO1xyXG5cclxuXHJcbiAgICAgICAgYm9tLmFwcGVuZENoaWxkKHRyKTtcclxuICAgICAgICBsZXQgaGFuZGxlciA9IGNyZWF0ZVJvd0hpZ2hsaWdodEhhbmRsZXIodHIuaWQsIHJlZmVyZW5jZXMpO1xyXG4gICAgICAgIHRyLm9uY2xpY2sgPSBoYW5kbGVyO1xyXG4gICAgICAgIGdsb2JhbERhdGEucHVzaEhpZ2hsaWdodEhhbmRsZXJzKHtcclxuICAgICAgICAgICAgaWQ6IHRyLmlkLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiBoYW5kbGVyLFxyXG4gICAgICAgICAgICByZWZzOiByZWZlcmVuY2VzXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChnZXRGaWx0ZXJCT00oKSAmJiBmaXJzdClcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGhhbmRsZXIoKTtcclxuICAgICAgICAgICAgZmlyc3QgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGhpZ2hsaWdodFByZXZpb3VzUm93KClcclxue1xyXG4gICAgaWYgKCFnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpXHJcbiAgICB7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpW2dsb2JhbERhdGEuZ2V0SGlnaGxpZ2h0SGFuZGxlcnMoKS5sZW5ndGggLSAxXS5oYW5kbGVyKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAgICAoZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpLmxlbmd0aCA+IDEpXHJcbiAgICAgICAgICAgICAmJiAoZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpWzBdLmlkID09IGdsb2JhbERhdGEuZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKSlcclxuICAgICAgICApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKClbZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpLmxlbmd0aCAtIDFdLmhhbmRsZXIoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKCkubGVuZ3RoIC0gMTsgaSsrKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpW2kgKyAxXS5pZCA9PSBnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpW2ldLmhhbmRsZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJlbmRlci5zbW9vdGhTY3JvbGxUb1JvdyhnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoaWdobGlnaHROZXh0Um93KClcclxue1xyXG4gICAgaWYgKCFnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpXHJcbiAgICB7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpWzBdLmhhbmRsZXIoKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBpZiAoICAgIChnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKCkubGVuZ3RoID4gMSlcclxuICAgICAgICAgICAgICYmIChnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKClbZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpLmxlbmd0aCAtIDFdLmlkID09IGdsb2JhbERhdGEuZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKSlcclxuICAgICAgICApXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodEhhbmRsZXJzKClbMF0uaGFuZGxlcigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGdsb2JhbERhdGEuZ2V0SGlnaGxpZ2h0SGFuZGxlcnMoKS5sZW5ndGg7IGkrKylcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0SGlnaGxpZ2h0SGFuZGxlcnMoKVtpIC0gMV0uaWQgPT0gZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpKVxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuZ2V0SGlnaGxpZ2h0SGFuZGxlcnMoKVtpXS5oYW5kbGVyKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBzbW9vdGhTY3JvbGxUb1JvdyhnbG9iYWxEYXRhLmdldEN1cnJlbnRIaWdobGlnaHRlZFJvd0lkKCkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwb3B1bGF0ZUxheWVyVGFibGUoKVxyXG57XHJcbiAgICBwb3B1bGF0ZUxheWVySGVhZGVyKCk7XHJcbiAgICBwb3B1bGF0ZUxheWVyQm9keSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwb3B1bGF0ZUJvbVRhYmxlKClcclxue1xyXG4gICAgcG9wdWxhdGVCb21IZWFkZXIoKTtcclxuICAgIHBvcHVsYXRlQm9tQm9keSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBtb2R1bGVzQ2xpY2tlZChyZWZlcmVuY2VzKVxyXG57XHJcbiAgICBsZXQgbGFzdENsaWNrZWRJbmRleCA9IHJlZmVyZW5jZXMuaW5kZXhPZihnbG9iYWxEYXRhLmdldExhc3RDbGlja2VkUmVmKCkpO1xyXG4gICAgbGV0IHJlZiA9IHJlZmVyZW5jZXNbKGxhc3RDbGlja2VkSW5kZXggKyAxKSAlIHJlZmVyZW5jZXMubGVuZ3RoXTtcclxuICAgIGZvciAobGV0IGhhbmRsZXIgb2YgZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRIYW5kbGVycygpKSBcclxuICAgIHtcclxuICAgICAgICBpZiAoaGFuZGxlci5yZWZzLmluZGV4T2YocmVmKSA+PSAwKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRMYXN0Q2xpY2tlZFJlZihyZWYpO1xyXG4gICAgICAgICAgICBoYW5kbGVyLmhhbmRsZXIoKTtcclxuICAgICAgICAgICAgc21vb3RoU2Nyb2xsVG9Sb3coZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzaWxrc2NyZWVuVmlzaWJsZSh2aXNpYmxlKVxyXG57XHJcbiAgICBpZiAodmlzaWJsZSlcclxuICAgIHtcclxuICAgICAgICBnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmZyb250LnNpbGsuc3R5bGUuZGlzcGxheSA9IFwiXCI7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5iYWNrLnNpbGsuc3R5bGUuZGlzcGxheSA9IFwiXCI7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJzaWxrc2NyZWVuVmlzaWJsZVwiLCB0cnVlKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmZyb250LnNpbGsuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xyXG4gICAgICAgIGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjay5zaWxrLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcInNpbGtzY3JlZW5WaXNpYmxlXCIsIGZhbHNlKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2hhbmdlQ2FudmFzTGF5b3V0KGxheW91dCkgXHJcbntcclxuICAgIGlmKG1haW5MYXlvdXQgIT0gXCJCT01cIilcclxuICAgIHtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZsLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmItYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJibC1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcclxuXHJcbiAgICAgICAgc3dpdGNoIChsYXlvdXQpIFxyXG4gICAgICAgIHtcclxuICAgICAgICBjYXNlIFwiRlwiOlxyXG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZsLWJ0blwiKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xyXG4gICAgICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRCb21MYXlvdXQoKSAhPSBcIkJPTVwiKSBcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5jb2xsYXBzZUNhbnZhc1NwbGl0KDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJCXCI6XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmwtYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XHJcbiAgICAgICAgICAgIGlmIChnbG9iYWxEYXRhLmdldEJvbUxheW91dCgpICE9IFwiQk9NXCIpIFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxEYXRhLmNvbGxhcHNlQ2FudmFzU3BsaXQoMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmYi1idG5cIikuY2xhc3NMaXN0LmFkZChcImRlcHJlc3NlZFwiKTtcclxuICAgICAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tTGF5b3V0KCkgIT0gXCJCT01cIikgXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0U2l6ZXNDYW52YXNTcGxpdChbNTAsIDUwXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBnbG9iYWxEYXRhLnNldENhbnZhc0xheW91dChsYXlvdXQpO1xyXG4gICAgICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiY2FudmFzbGF5b3V0XCIsIGxheW91dCk7XHJcbiAgICAgICAgcmVuZGVyLnJlc2l6ZUFsbCgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwb3B1bGF0ZU1ldGFkYXRhKClcclxue1xyXG4gICAgbGV0IG1ldGFkYXRhICA9IHBjYi5HZXRNZXRhZGF0YSgpO1xyXG4gICAgaWYobWV0YWRhdGEucmV2aXNpb24gPT0gdW5kZWZpbmVkKVxyXG4gICAge1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicmV2aXNpb25cIikuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJldmlzaW9uXCIpLmlubmVySFRNTCA9IFwiUmV2aXNpb246IFwiICsgbWV0YWRhdGEucmV2aXNpb24udG9TdHJpbmcoKTs7XHJcbiAgICB9XHJcblxyXG4gICAgaWYobWV0YWRhdGEuY29tcGFueSA9PSB1bmRlZmluZWQpXHJcbiAgICB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb21wYW55XCIpLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICB9XHJcbiAgICBlbHNlXHJcbiAgICB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb21wYW55XCIpLmlubmVySFRNTCAgPSBtZXRhZGF0YS5jb21wYW55O1xyXG4gICAgfVxyXG5cclxuICAgIGlmKG1ldGFkYXRhLnRpdGxlID09IHVuZGVmaW5lZClcclxuICAgIHtcclxuICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0aXRsZVwiKS5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRpdGxlXCIpLmlubmVySFRNTCA9IG1ldGFkYXRhLnRpdGxlO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKG1ldGFkYXRhLmRhdGUgPT0gdW5kZWZpbmVkKVxyXG4gICAge1xyXG4gICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZpbGVkYXRlXCIpLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICB9XHJcbiAgICBlbHNlXHJcbiAgICB7XHJcbiAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmlsZWRhdGVcIikuaW5uZXJIVE1MID0gbWV0YWRhdGEuZGF0ZTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmxldCBsYXllclZpc2FibGUgPSB0cnVlO1xyXG5sZXQgbWFpbkxheW91dCA9IFwiXCI7XHJcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5LWJ0blwiKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xyXG5mdW5jdGlvbiB0b2dnbGVMYXllcnMoKVxyXG57XHJcbiAgICBpZiAobGF5ZXJWaXNhYmxlKVxyXG4gICAge1xyXG4gICAgICAgIGxheWVyVmlzYWJsZSA9IGZhbHNlO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5LWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIGxheWVyVmlzYWJsZSA9IHRydWU7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXktYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XHJcbiAgICB9XHJcbiAgICBjaGFuZ2VCb21MYXlvdXQobWFpbkxheW91dCk7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBjaGFuZ2VCb21MYXlvdXQobGF5b3V0KVxyXG57XHJcbiAgICBtYWluTGF5b3V0ID0gbGF5b3V0O1xyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XHJcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbS1sci1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcclxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLXRiLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwY2ItYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XHJcbiAgICBzd2l0Y2ggKGxheW91dCkgXHJcbiAgICB7XHJcbiAgICBjYXNlIFwiQk9NXCI6XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XHJcblxyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmwtYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmYi1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJsLWJ0blwiKS5jbGFzc0xpc3QucmVtb3ZlKFwiZGVwcmVzc2VkXCIpO1xyXG5cclxuICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRCb21TcGxpdCgpKSBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmKGxheWVyVmlzYWJsZSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95TGF5ZXJTcGxpdCgpO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRMYXllclNwbGl0KG51bGwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUJvbVNwbGl0KCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tU3BsaXQobnVsbCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUNhbnZhc1NwbGl0KCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Q2FudmFzU3BsaXQobnVsbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbWRpdlwiKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyb250Y2FudmFzXCIpLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJhY2tjYW52YXNcIikuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xyXG4gICAgICAgIGlmKGxheWVyVmlzYWJsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxheWVyVmlzYWJsZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheS1idG5cIikuY2xhc3NMaXN0LnJlbW92ZShcImRlcHJlc3NlZFwiKTtcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiKS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvdFwiKS5zdHlsZS5oZWlnaHQgPSBcIlwiO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRhdGFkaXZcIiAgICkuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiBjYXNlIFwiUENCXCI6XHJcbiAgICBcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInBjYi1idG5cIiAgICAgKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIpLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyb250Y2FudmFzXCIpLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2NhbnZhc1wiICkuc3R5bGUuZGlzcGxheSA9IFwiXCI7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYobGF5ZXJWaXNhYmxlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvdFwiICAgICAgICApLnN0eWxlLmhlaWdodCA9IFwiY2FsYyg5MCUpXCI7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkYXRhZGl2XCIgICApLmNsYXNzTGlzdC5hZGQoICAgXCJzcGxpdC1ob3Jpem9udGFsXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIgICAgICkuY2xhc3NMaXN0LnJlbW92ZSggICBcInNwbGl0LWhvcml6b250YWxcIik7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNkaXZcIiAgKS5jbGFzc0xpc3QucmVtb3ZlKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyb250Y2FudmFzXCIpLmNsYXNzTGlzdC5hZGQoICAgXCJzcGxpdC1ob3Jpem9udGFsXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2NhbnZhc1wiICkuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XHJcbiAgICAgICAgaWYobGF5ZXJWaXNhYmxlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChnbG9iYWxEYXRhLmdldEJvbVNwbGl0KCkpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lMYXllclNwbGl0KCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0TGF5ZXJTcGxpdChudWxsKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95Qm9tU3BsaXQoKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21TcGxpdChudWxsKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95Q2FudmFzU3BsaXQoKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNTcGxpdChudWxsKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKGxheWVyVmlzYWJsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0TGF5ZXJTcGxpdChTcGxpdChbXCIjZGF0YWRpdlwiLCBcIiNsYXllcmRpdlwiXSwge1xyXG4gICAgICAgICAgICAgICAgc2l6ZXM6IFs4MCwgMjBdLFxyXG4gICAgICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxyXG4gICAgICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcclxuICAgICAgICAgICAgICAgIGN1cnNvcjogXCJjb2wtcmVzaXplXCJcclxuICAgICAgICAgICAgfSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldExheWVyU3BsaXQoU3BsaXQoW1wiI2RhdGFkaXZcIiwgXCIjbGF5ZXJkaXZcIl0sIHtcclxuICAgICAgICAgICAgICAgIHNpemVzOiBbOTksIDAuMV0sXHJcbiAgICAgICAgICAgICAgICBvbkRyYWdFbmQ6IHJlbmRlci5yZXNpemVBbGwsXHJcbiAgICAgICAgICAgICAgICBndXR0ZXJTaXplOiA1LFxyXG4gICAgICAgICAgICAgICAgY3Vyc29yOiBcImNvbC1yZXNpemVcIlxyXG4gICAgICAgICAgICB9KSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBnbG9iYWxEYXRhLnNldEJvbVNwbGl0KFNwbGl0KFtcIiNib21kaXZcIiwgXCIjY2FudmFzZGl2XCJdLCB7XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbjogXCJ2ZXJ0aWNhbFwiLFxyXG4gICAgICAgICAgICBzaXplczogWzUwLCA1MF0sXHJcbiAgICAgICAgICAgIG9uRHJhZ0VuZDogcmVuZGVyLnJlc2l6ZUFsbCxcclxuICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcclxuICAgICAgICAgICAgY3Vyc29yOiBcInJvdy1yZXNpemVcIlxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNTcGxpdChTcGxpdChbXCIjZnJvbnRjYW52YXNcIiwgXCIjYmFja2NhbnZhc1wiXSwge1xyXG4gICAgICAgICAgICBzaXplczogWzUwLCA1MF0sXHJcbiAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXHJcbiAgICAgICAgICAgIG9uRHJhZ0VuZDogcmVuZGVyLnJlc2l6ZUFsbCxcclxuICAgICAgICAgICAgY3Vyc29yOiBcInJvdy1yZXNpemVcIlxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNkaXZcIiAgKS5zdHlsZS5oZWlnaHQgPSBcImNhbGMoOTklKVwiO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgY2FzZSBcIlRCXCI6XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib20tdGItYnRuXCIgICAgICkuY2xhc3NMaXN0LmFkZChcImRlcHJlc3NlZFwiKTtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbWRpdlwiKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyb250Y2FudmFzXCIpLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2NhbnZhc1wiICkuc3R5bGUuZGlzcGxheSA9IFwiXCI7XHJcbiAgICAgICAgaWYobGF5ZXJWaXNhYmxlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm90XCIgICAgICAgICkuc3R5bGUuaGVpZ2h0ID0gXCJjYWxjKDkwJSlcIjtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkYXRhZGl2XCIgICApLmNsYXNzTGlzdC5hZGQoICAgXCJzcGxpdC1ob3Jpem9udGFsXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIgICAgICkuY2xhc3NMaXN0LnJlbW92ZSggICBcInNwbGl0LWhvcml6b250YWxcIik7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNkaXZcIiAgKS5jbGFzc0xpc3QucmVtb3ZlKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyb250Y2FudmFzXCIpLmNsYXNzTGlzdC5hZGQoICAgXCJzcGxpdC1ob3Jpem9udGFsXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2NhbnZhc1wiICkuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XHJcbiAgICAgICAgaWYobGF5ZXJWaXNhYmxlKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChnbG9iYWxEYXRhLmdldEJvbVNwbGl0KCkpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lMYXllclNwbGl0KCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0TGF5ZXJTcGxpdChudWxsKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95Qm9tU3BsaXQoKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRCb21TcGxpdChudWxsKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5kZXN0cm95Q2FudmFzU3BsaXQoKTtcclxuICAgICAgICAgICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNTcGxpdChudWxsKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKGxheWVyVmlzYWJsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0TGF5ZXJTcGxpdChTcGxpdChbXCIjZGF0YWRpdlwiLCBcIiNsYXllcmRpdlwiXSwge1xyXG4gICAgICAgICAgICAgICAgc2l6ZXM6IFs4MCwgMjBdLFxyXG4gICAgICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxyXG4gICAgICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcclxuICAgICAgICAgICAgICAgIGN1cnNvcjogXCJjb2wtcmVzaXplXCJcclxuICAgICAgICAgICAgfSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBnbG9iYWxEYXRhLnNldEJvbVNwbGl0KFNwbGl0KFtcIiNib21kaXZcIiwgXCIjY2FudmFzZGl2XCJdLCB7XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbjogXCJ2ZXJ0aWNhbFwiLFxyXG4gICAgICAgICAgICBzaXplczogWzUwLCA1MF0sXHJcbiAgICAgICAgICAgIG9uRHJhZ0VuZDogcmVuZGVyLnJlc2l6ZUFsbCxcclxuICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcclxuICAgICAgICAgICAgY3Vyc29yOiBcInJvdy1yZXNpemVcIlxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNTcGxpdChTcGxpdChbXCIjZnJvbnRjYW52YXNcIiwgXCIjYmFja2NhbnZhc1wiXSwge1xyXG4gICAgICAgICAgICBzaXplczogWzUwLCA1MF0sXHJcbiAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXHJcbiAgICAgICAgICAgIG9uRHJhZ0VuZDogcmVuZGVyLnJlc2l6ZUFsbCxcclxuICAgICAgICAgICAgY3Vyc29yOiBcInJvdy1yZXNpemVcIlxyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgXHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiTFJcIjpcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbS1sci1idG5cIiAgICAgKS5jbGFzc0xpc3QuYWRkKFwiZGVwcmVzc2VkXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIpLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJvbnRjYW52YXNcIikuc3R5bGUuZGlzcGxheSA9IFwiXCI7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJiYWNrY2FudmFzXCIgKS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcclxuICAgICAgICBpZihsYXllclZpc2FibGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyZGl2XCIgICApLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyZGl2XCIgICApLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib3RcIiAgICAgICAgKS5zdHlsZS5oZWlnaHQgPSBcImNhbGMoOTAlKVwiO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRhdGFkaXZcIiAgICApLmNsYXNzTGlzdC5hZGQoICAgXCJzcGxpdC1ob3Jpem9udGFsXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tZGl2XCIgICAgICkuY2xhc3NMaXN0LmFkZCggICBcInNwbGl0LWhvcml6b250YWxcIik7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNkaXZcIiAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyb250Y2FudmFzXCIpLmNsYXNzTGlzdC5yZW1vdmUoICAgXCJzcGxpdC1ob3Jpem9udGFsXCIpO1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2NhbnZhc1wiICkuY2xhc3NMaXN0LnJlbW92ZSggICBcInNwbGl0LWhvcml6b250YWxcIik7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmRpdlwiICAgKS5jbGFzc0xpc3QuYWRkKCAgIFwic3BsaXQtaG9yaXpvbnRhbFwiKTtcclxuXHJcbiAgICAgICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tU3BsaXQoKSlcclxuICAgICAgICB7XHJcblxyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLmRlc3Ryb3lMYXllclNwbGl0KCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0TGF5ZXJTcGxpdChudWxsKTtcclxuXHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUJvbVNwbGl0KCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tU3BsaXQobnVsbCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuZGVzdHJveUNhbnZhc1NwbGl0KCk7XHJcbiAgICAgICAgICAgIGdsb2JhbERhdGEuc2V0Q2FudmFzU3BsaXQobnVsbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZihsYXllclZpc2FibGUpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBnbG9iYWxEYXRhLnNldExheWVyU3BsaXQoU3BsaXQoW1wiI2RhdGFkaXZcIiwgXCIjbGF5ZXJkaXZcIl0sIHtcclxuICAgICAgICAgICAgICAgIHNpemVzOiBbODAsIDIwXSxcclxuICAgICAgICAgICAgICAgIG9uRHJhZ0VuZDogcmVuZGVyLnJlc2l6ZUFsbCxcclxuICAgICAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXHJcbiAgICAgICAgICAgICAgICBjdXJzb3I6IFwiY29sLXJlc2l6ZVwiXHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tU3BsaXQoU3BsaXQoW1wiI2JvbWRpdlwiLCBcIiNjYW52YXNkaXZcIl0sIHtcclxuICAgICAgICAgICAgc2l6ZXM6IFs1MCwgNTBdLFxyXG4gICAgICAgICAgICBvbkRyYWdFbmQ6IHJlbmRlci5yZXNpemVBbGwsXHJcbiAgICAgICAgICAgIGd1dHRlclNpemU6IDUsXHJcbiAgICAgICAgICAgIGN1cnNvcjogXCJyb3ctcmVzaXplXCJcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Q2FudmFzU3BsaXQoU3BsaXQoW1wiI2Zyb250Y2FudmFzXCIsIFwiI2JhY2tjYW52YXNcIl0sIHtcclxuICAgICAgICAgICAgc2l6ZXM6IFs1MCwgNTBdLFxyXG4gICAgICAgICAgICBkaXJlY3Rpb246IFwidmVydGljYWxcIixcclxuICAgICAgICAgICAgZ3V0dGVyU2l6ZTogNSxcclxuICAgICAgICAgICAgb25EcmFnRW5kOiByZW5kZXIucmVzaXplQWxsLFxyXG4gICAgICAgICAgICBjdXJzb3I6IFwicm93LXJlc2l6ZVwiXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgZ2xvYmFsRGF0YS5zZXRCb21MYXlvdXQobGF5b3V0KTtcclxuICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiYm9tbGF5b3V0XCIsIGxheW91dCk7XHJcbiAgICBwb3B1bGF0ZUJvbVRhYmxlKCk7XHJcbiAgICBjaGFuZ2VDYW52YXNMYXlvdXQoZ2xvYmFsRGF0YS5nZXRDYW52YXNMYXlvdXQoKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZvY3VzSW5wdXRGaWVsZChpbnB1dClcclxue1xyXG4gICAgaW5wdXQuc2Nyb2xsSW50b1ZpZXcoZmFsc2UpO1xyXG4gICAgaW5wdXQuZm9jdXMoKTtcclxuICAgIGlucHV0LnNlbGVjdCgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmb2N1c0JPTUZpbHRlckZpZWxkKClcclxue1xyXG4gICAgZm9jdXNJbnB1dEZpZWxkKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9tLWZpbHRlclwiKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRvZ2dsZUJvbUNoZWNrYm94KGJvbXJvd2lkLCBjaGVja2JveG51bSlcclxue1xyXG4gICAgaWYgKCFib21yb3dpZCB8fCBjaGVja2JveG51bSA+IGdsb2JhbERhdGEuZ2V0Q2hlY2tib3hlcygpLmxlbmd0aClcclxuICAgIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBsZXQgYm9tcm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYm9tcm93aWQpO1xyXG4gICAgbGV0IGNoZWNrYm94ID0gYm9tcm93LmNoaWxkTm9kZXNbY2hlY2tib3hudW1dLmNoaWxkTm9kZXNbMF07XHJcbiAgICBjaGVja2JveC5jaGVja2VkID0gIWNoZWNrYm94LmNoZWNrZWQ7XHJcbiAgICBjaGVja2JveC5pbmRldGVybWluYXRlID0gZmFsc2U7XHJcbiAgICBjaGVja2JveC5vbmNoYW5nZSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBJc0NoZWNrYm94Q2xpY2tlZChib21yb3dpZCwgY2hlY2tib3huYW1lKSBcclxue1xyXG4gICAgbGV0IGNoZWNrYm94bnVtID0gMDtcclxuICAgIHdoaWxlIChjaGVja2JveG51bSA8IGdsb2JhbERhdGEuZ2V0Q2hlY2tib3hlcygpLmxlbmd0aCAmJiBnbG9iYWxEYXRhLmdldENoZWNrYm94ZXMoKVtjaGVja2JveG51bV0udG9Mb3dlckNhc2UoKSAhPSBjaGVja2JveG5hbWUudG9Mb3dlckNhc2UoKSkgXHJcbiAgICB7XHJcbiAgICAgICAgY2hlY2tib3hudW0rKztcclxuICAgIH1cclxuICAgIGlmICghYm9tcm93aWQgfHwgY2hlY2tib3hudW0gPj0gZ2xvYmFsRGF0YS5nZXRDaGVja2JveGVzKCkubGVuZ3RoKSBcclxuICAgIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBsZXQgYm9tcm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYm9tcm93aWQpO1xyXG4gICAgbGV0IGNoZWNrYm94ID0gYm9tcm93LmNoaWxkTm9kZXNbY2hlY2tib3hudW0gKyAxXS5jaGlsZE5vZGVzWzBdO1xyXG4gICAgcmV0dXJuIGNoZWNrYm94LmNoZWNrZWQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbW92ZUd1dHRlck5vZGUobm9kZSlcclxue1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXHJcbiAgICB7XHJcbiAgICAgICAgaWYgKCAgICAobm9kZS5jaGlsZE5vZGVzW2ldLmNsYXNzTGlzdCApXHJcbiAgICAgICAgICAgICAmJiAobm9kZS5jaGlsZE5vZGVzW2ldLmNsYXNzTGlzdC5jb250YWlucyhcImd1dHRlclwiKSkgXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbm9kZS5yZW1vdmVDaGlsZChub2RlLmNoaWxkTm9kZXNbaV0pO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFuR3V0dGVycygpXHJcbntcclxuICAgIHJlbW92ZUd1dHRlck5vZGUoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib3RcIikpO1xyXG4gICAgcmVtb3ZlR3V0dGVyTm9kZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc2RpdlwiKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldEJvbUNoZWNrYm94ZXModmFsdWUpXHJcbntcclxuICAgIGdsb2JhbERhdGEuc2V0Qm9tQ2hlY2tib3hlcyh2YWx1ZSk7XHJcbiAgICBnbG9iYWxEYXRhLndyaXRlU3RvcmFnZShcImJvbUNoZWNrYm94ZXNcIiwgdmFsdWUpO1xyXG4gICAgcG9wdWxhdGVCb21UYWJsZSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRSZW1vdmVCT01FbnRyaWVzKHZhbHVlKVxyXG57XHJcbiAgICBnbG9iYWxEYXRhLnNldFJlbW92ZUJPTUVudHJpZXModmFsdWUpO1xyXG4gICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJyZW1vdmVCT01FbnRyaWVzXCIsIHZhbHVlKTtcclxuICAgIHBvcHVsYXRlQm9tVGFibGUoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0QWRkaXRpb25hbEF0dHJpYnV0ZXModmFsdWUpXHJcbntcclxuICAgIGdsb2JhbERhdGEuc2V0QWRkaXRpb25hbEF0dHJpYnV0ZXModmFsdWUpO1xyXG4gICAgZ2xvYmFsRGF0YS53cml0ZVN0b3JhZ2UoXCJhZGRpdGlvbmFsQXR0cmlidXRlc1wiLCB2YWx1ZSk7XHJcbiAgICBwb3B1bGF0ZUJvbVRhYmxlKCk7XHJcbn1cclxuXHJcbi8vIFhYWDogTm9uZSBvZiB0aGlzIHNlZW1zIHRvIGJlIHdvcmtpbmcuIFxyXG5kb2N1bWVudC5vbmtleWRvd24gPSBmdW5jdGlvbihlKVxyXG57XHJcbiAgICBzd2l0Y2ggKGUua2V5KVxyXG4gICAge1xyXG4gICAgY2FzZSBcIm5cIjpcclxuICAgICAgICBpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudC50eXBlID09IFwidGV4dFwiKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZ2xvYmFsRGF0YS5nZXRDdXJyZW50SGlnaGxpZ2h0ZWRSb3dJZCgpICE9PSBudWxsKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gWFhYOiBXaHkgd2FzIHRoZSBmb2xsb3dpbmcgbGluZSBpbiB0aGUgc29mdHdhcmVcclxuICAgICAgICAgICAgLy9jaGVja0JvbUNoZWNrYm94KGdsb2JhbERhdGEuZ2V0Q3VycmVudEhpZ2hsaWdodGVkUm93SWQoKSwgXCJwbGFjZWRcIik7XHJcbiAgICAgICAgICAgIGhpZ2hsaWdodE5leHRSb3coKTtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJBcnJvd1VwXCI6XHJcbiAgICAgICAgaGlnaGxpZ2h0UHJldmlvdXNSb3coKTtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiQXJyb3dEb3duXCI6XHJcbiAgICAgICAgaGlnaGxpZ2h0TmV4dFJvdygpO1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJGMTFcIjpcclxuICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZS5hbHRLZXkpXHJcbiAgICB7XHJcbiAgICAgICAgc3dpdGNoIChlLmtleSlcclxuICAgICAgICB7XHJcbiAgICAgICAgY2FzZSBcImZcIjpcclxuICAgICAgICAgICAgZm9jdXNCT01GaWx0ZXJGaWVsZCgpO1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ6XCI6XHJcbiAgICAgICAgICAgIGNoYW5nZUJvbUxheW91dChcIkJPTVwiKTtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwieFwiOlxyXG4gICAgICAgICAgICBjaGFuZ2VCb21MYXlvdXQoXCJMUlwiKTtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiY1wiOlxyXG4gICAgICAgICAgICBjaGFuZ2VCb21MYXlvdXQoXCJUQlwiKTtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidlwiOlxyXG4gICAgICAgICAgICBjaGFuZ2VDYW52YXNMYXlvdXQoXCJGXCIpO1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJiXCI6XHJcbiAgICAgICAgICAgIGNoYW5nZUNhbnZhc0xheW91dChcIkZCXCIpO1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJuXCI6XHJcbiAgICAgICAgICAgIGNoYW5nZUNhbnZhc0xheW91dChcIkJcIik7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59O1xyXG5cclxuXHJcbi8vIFRPRE86IFJlbW92ZSBnbG9iYWwgdmFyaWFibGUuIFVzZWQgdG8gdGVzdCBmZWF0dXJlLlxyXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZ1bGxzY3JlZW4tYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XHJcbmxldCBpc0Z1bGxzY3JlZW4gPSBmYWxzZTtcclxuZnVuY3Rpb24gdG9nZ2xlRnVsbFNjcmVlbigpXHJcbntcclxuICAgIGlmKGlzRnVsbHNjcmVlbilcclxuICAgIHtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZ1bGxzY3JlZW4tYnRuXCIpLmNsYXNzTGlzdC5yZW1vdmUoXCJkZXByZXNzZWRcIik7XHJcbiAgICAgICAgaXNGdWxsc2NyZWVuID0gZmFsc2U7XHJcbiAgICAgICAgRnVsbHNjcmVlbi5jbG9zZUZ1bGxzY3JlZW4oKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZ1bGxzY3JlZW4tYnRuXCIpLmNsYXNzTGlzdC5hZGQoXCJkZXByZXNzZWRcIik7XHJcbiAgICAgICAgaXNGdWxsc2NyZWVuID0gdHJ1ZTtcclxuICAgICAgICBGdWxsc2NyZWVuLm9wZW5GdWxsc2NyZWVuKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vL1hYWDogSSB3b3VsZCBsaWtlIHRoaXMgdG8gYmUgaW4gdGhlIGh0bWwgZnVuY3Rpb25zIGpzIGZpbGUuIEJ1dCB0aGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIFxyXG4vLyAgICAgcGxhY2VkIGhlcmUsIG90aGVyd2lzZSB0aGUgYXBwbGljYXRpb24gcmVuZGVyaW5nIGJlY29tZXMgdmVyeSB2ZXJ5IHdlaXJkLlxyXG53aW5kb3cub25sb2FkID0gZnVuY3Rpb24oZSlcclxue1xyXG4gICAgY29uc29sZS50aW1lKFwib24gbG9hZFwiKTtcclxuICAgIC8vIFRoaXMgZnVuY3Rpb24gbWFrZXMgc28gdGhhdCB0aGUgdXNlciBkYXRhIGZvciB0aGUgcGNiIGlzIGNvbnZlcnRlZCB0byBvdXIgaW50ZXJuYWwgc3RydWN0dXJlXHJcbiAgICBwY2IuT3BlblBjYkRhdGEocGNiZGF0YSlcclxuXHJcbiAgICBsZXQgdmVyc2lvbk51bWJlckhUTUwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNvZnR3YXJlVmVyc2lvblwiKTtcclxuICAgIHZlcnNpb25OdW1iZXJIVE1MLmlubmVySFRNTCA9IHZlcnNpb24uR2V0VmVyc2lvblN0cmluZygpO1xyXG4gICAgLy8gQ3JlYXRlIGNhbnZhcyBsYXllcnMuIE9uZSBjYW52YXMgcGVyIHBjYiBsYXllclxyXG5cclxuICAgIGdsb2JhbERhdGEuaW5pdFN0b3JhZ2UoKTtcclxuICAgIGNsZWFuR3V0dGVycygpO1xyXG4gICAgLy8gTXVzdCBiZSBjYWxsZWQgYWZ0ZXIgbG9hZGluZyBQQ0IgYXMgcmVuZGVyaW5nIHJlcXVpcmVkIHRoZSBib3VuZGluZyBib3ggaW5mb3JtYXRpb24gZm9yIFBDQlxyXG4gICAgcmVuZGVyLmluaXRSZW5kZXIoKTtcclxuXHJcbiAgICAvLyBTZXQgdXAgbW91c2UgZXZlbnQgaGFuZGxlcnNcclxuICAgIGhhbmRsZXJzX21vdXNlLmFkZE1vdXNlSGFuZGxlcnMoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmcm9udGNhbnZhc1wiKSwgZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5mcm9udCk7XHJcbiAgICBoYW5kbGVyc19tb3VzZS5hZGRNb3VzZUhhbmRsZXJzKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYmFja2NhbnZhc1wiKSwgZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5iYWNrKTtcclxuXHJcblxyXG4gICAgYm9tID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib21ib2R5XCIpO1xyXG4gICAgbGF5ZXJCb2R5ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsYXllcmJvZHlcIik7XHJcbiAgICBsYXllckhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheWVyaGVhZFwiKTtcclxuICAgIGJvbWhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJvbWhlYWRcIik7XHJcbiAgICBnbG9iYWxEYXRhLnNldEJvbUxheW91dChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiYm9tbGF5b3V0XCIpKTtcclxuICAgIGlmICghZ2xvYmFsRGF0YS5nZXRCb21MYXlvdXQoKSlcclxuICAgIHtcclxuICAgICAgICBnbG9iYWxEYXRhLnNldEJvbUxheW91dChcIkxSXCIpO1xyXG4gICAgfVxyXG4gICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNMYXlvdXQoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImNhbnZhc2xheW91dFwiKSk7XHJcbiAgICBpZiAoIWdsb2JhbERhdGEuZ2V0Q2FudmFzTGF5b3V0KCkpXHJcbiAgICB7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRDYW52YXNMYXlvdXQoXCJGQlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwb3B1bGF0ZUxheWVyVGFibGUoKTtcclxuXHJcbiAgICBwb3B1bGF0ZU1ldGFkYXRhKCk7XHJcbiAgICBnbG9iYWxEYXRhLnNldEJvbUNoZWNrYm94ZXMoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImJvbUNoZWNrYm94ZXNcIikpO1xyXG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0Qm9tQ2hlY2tib3hlcygpID09PSBudWxsKVxyXG4gICAge1xyXG4gICAgICAgIGdsb2JhbERhdGEuc2V0Qm9tQ2hlY2tib3hlcyhcIlBsYWNlZFwiKTtcclxuICAgIH1cclxuICAgIGdsb2JhbERhdGEuc2V0UmVtb3ZlQk9NRW50cmllcyhnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwicmVtb3ZlQk9NRW50cmllc1wiKSk7XHJcbiAgICBpZiAoZ2xvYmFsRGF0YS5nZXRSZW1vdmVCT01FbnRyaWVzKCkgPT09IG51bGwpXHJcbiAgICB7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRSZW1vdmVCT01FbnRyaWVzKFwiXCIpO1xyXG4gICAgfVxyXG4gICAgZ2xvYmFsRGF0YS5zZXRBZGRpdGlvbmFsQXR0cmlidXRlcyhnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiYWRkaXRpb25hbEF0dHJpYnV0ZXNcIikpO1xyXG4gICAgaWYgKGdsb2JhbERhdGEuZ2V0QWRkaXRpb25hbEF0dHJpYnV0ZXMoKSA9PT0gbnVsbClcclxuICAgIHtcclxuICAgICAgICBnbG9iYWxEYXRhLnNldEFkZGl0aW9uYWxBdHRyaWJ1dGVzKFwiXCIpO1xyXG4gICAgfVxyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib21DaGVja2JveGVzXCIpLnZhbHVlID0gZ2xvYmFsRGF0YS5nZXRCb21DaGVja2JveGVzKCk7XHJcbiAgICBpZiAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcInNpbGtzY3JlZW5WaXNpYmxlXCIpID09PSBcImZhbHNlXCIpXHJcbiAgICB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaWxrc2NyZWVuQ2hlY2tib3hcIikuY2hlY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgIHNpbGtzY3JlZW5WaXNpYmxlKGZhbHNlKTtcclxuICAgIH1cclxuICAgIGlmIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwicmVkcmF3T25EcmFnXCIpID09PSBcImZhbHNlXCIpXHJcbiAgICB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkcmFnQ2hlY2tib3hcIikuY2hlY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgIGdsb2JhbERhdGEuc2V0UmVkcmF3T25EcmFnKGZhbHNlKTtcclxuICAgIH1cclxuICAgIGlmIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiZGFya21vZGVcIikgPT09IFwidHJ1ZVwiKVxyXG4gICAge1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGFya21vZGVDaGVja2JveFwiKS5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICBzZXREYXJrTW9kZSh0cnVlKTtcclxuICAgIH1cclxuICAgIGlmIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiaGlkZVBsYWNlZFBhcnRzXCIpID09PSBcInRydWVcIilcclxuICAgIHtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhpZGVQbGFjZWRQYXJ0c1wiKS5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICBnbG9iYWxEYXRhLnNldEhpZGVQbGFjZWRQYXJ0cyh0cnVlKTtcclxuICAgIH1cclxuICAgIGlmIChnbG9iYWxEYXRhLnJlYWRTdG9yYWdlKFwiaGlnaGxpZ2h0cGluMVwiKSA9PT0gXCJ0cnVlXCIpXHJcbiAgICB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJoaWdobGlnaHRwaW4xQ2hlY2tib3hcIikuY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXRIaWdobGlnaHRQaW4xKHRydWUpO1xyXG4gICAgICAgIHJlbmRlci5kcmF3Q2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xyXG4gICAgICAgIHJlbmRlci5kcmF3Q2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjayk7XHJcbiAgICB9XHJcbiAgICAvLyBJZiB0aGlzIGlzIHRydWUgdGhlbiBjb21iaW5lIHBhcnRzIGFuZCBkaXNwbGF5IHF1YW50aXR5XHJcbiAgICBpZiAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImNvbWJpbmVWYWx1ZXNcIikgPT09IFwidHJ1ZVwiKVxyXG4gICAge1xyXG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29tYmluZVZhbHVlc1wiKS5jaGVja2VkID0gdHJ1ZTtcclxuICAgICAgICBnbG9iYWxEYXRhLnNldENvbWJpbmVWYWx1ZXModHJ1ZSk7XHJcbiAgICB9XHJcbiAgICBpZiAoZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImRlYnVnTW9kZVwiKSA9PT0gXCJ0cnVlXCIpXHJcbiAgICB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkZWJ1Z01vZGVcIikuY2hlY2tlZCA9IHRydWU7XHJcbiAgICAgICAgZ2xvYmFsRGF0YS5zZXREZWJ1Z01vZGUodHJ1ZSk7XHJcbiAgICB9XHJcbiAgICAvLyBSZWFkIHRoZSB2YWx1ZSBvZiBib2FyZCByb3RhdGlvbiBmcm9tIGxvY2FsIHN0b3JhZ2VcclxuICAgIGxldCBib2FyZFJvdGF0aW9uID0gZ2xvYmFsRGF0YS5yZWFkU3RvcmFnZShcImJvYXJkUm90YXRpb25cIik7XHJcbiAgICAvKlxyXG4gICAgICBBZGp1c3RlZCB0byBtYXRjaCBob3cgdGhlIHVwZGF0ZSByb3RhdGlvbiBhbmdsZSBpcyBjYWxjdWxhdGVkLlxyXG4gICAgXHJcbiAgICAgICAgSWYgbnVsbCwgdGhlbiBhbmdsZSBub3QgaW4gbG9jYWwgc3RvcmFnZSwgc2V0IHRvIDE4MCBkZWdyZWVzLlxyXG4gICAgICAqL1xyXG4gICAgaWYgKGJvYXJkUm90YXRpb24gPT09IG51bGwpXHJcbiAgICB7XHJcbiAgICAgICAgYm9hcmRSb3RhdGlvbiA9IDE4MDtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBib2FyZFJvdGF0aW9uID0gcGFyc2VJbnQoYm9hcmRSb3RhdGlvbik7XHJcbiAgICB9XHJcbiAgICAvLyBTZXQgaW50ZXJuYWwgZ2xvYmFsIHZhcmlhYmxlIGZvciBib2FyZCByb3RhdGlvbi5cclxuICAgIGdsb2JhbERhdGEuU2V0Qm9hcmRSb3RhdGlvbihib2FyZFJvdGF0aW9uKTtcclxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYm9hcmRSb3RhdGlvblwiKS52YWx1ZSA9IChib2FyZFJvdGF0aW9uLTE4MCkgLyA1O1xyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3RhdGlvbkRlZ3JlZVwiKS50ZXh0Q29udGVudCA9IChib2FyZFJvdGF0aW9uLTE4MCk7XHJcblxyXG4gICAgLy8gVHJpZ2dlcnMgcmVuZGVyXHJcbiAgICBjaGFuZ2VCb21MYXlvdXQoZ2xvYmFsRGF0YS5nZXRCb21MYXlvdXQoKSk7XHJcbiAgICBjb25zb2xlLnRpbWVFbmQoXCJvbiBsb2FkXCIpO1xyXG59O1xyXG5cclxud2luZG93Lm9ucmVzaXplID0gcmVuZGVyLnJlc2l6ZUFsbDtcclxud2luZG93Lm1hdGNoTWVkaWEoXCJwcmludFwiKS5hZGRMaXN0ZW5lcihyZW5kZXIucmVzaXplQWxsKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgc2V0RGFya01vZGUgICAgICAgICwgc2lsa3NjcmVlblZpc2libGUgICAgICAsIGNoYW5nZUJvbUxheW91dCwgY2hhbmdlQ2FudmFzTGF5b3V0LFxyXG4gICAgc2V0Qm9tQ2hlY2tib3hlcyAgICwgcG9wdWxhdGVCb21UYWJsZSAgICAgICAsIHNldEZpbHRlckJPTSAgICwgZ2V0RmlsdGVyQk9NICAgICAgLFxyXG4gICAgc2V0RmlsdGVyTGF5ZXIgICAgICwgZ2V0RmlsdGVyTGF5ZXIgICAgICAgICAsIHNldFJlbW92ZUJPTUVudHJpZXMsIHNldEFkZGl0aW9uYWxBdHRyaWJ1dGVzLFxyXG4gICAgdG9nZ2xlTGF5ZXJzLCB0b2dnbGVGdWxsU2NyZWVuXHJcbn07XHJcbiIsIi8qXHJcbiAgICBUaGlzIGZpbGUgY29udGFpbnMgYWxsIG9mIHRoZSBkZWZpbml0aW9ucyBmb3Igd29ya2luZyB3aXRoIHBjYmRhdGEuanNvbi4gXHJcbiAgICBUaGlzIGZpbGUgZGVjbGFyZXMgYWxsIG9mIHRoZSBhY2Nlc3MgZnVuY3Rpb25zIGFuZCBpbnRlcmZhY2VzIGZvciBjb252ZXJ0aW5nIFxyXG4gICAgdGhlIGpzb24gZmlsZSBpbnRvIGFuIGludGVybmFsIGRhdGEgc3RydWN0dXJlLiBcclxuKi9cclxuXHJcblwidXNlIHN0cmljdFwiO1xyXG5cclxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFBDQiBQYXJ0IEludGVyZmFjZXNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbi8vIFJlYWQgdGhlIGVjYWQgcHJvcGVydHkuIFRoaXMgcHJvcGVydHkgbGV0cyB0aGUgYXBwbGljYXRpb24ga25vdyB3aGF0IFxyXG4vLyBlY2FkIHNvZnR3YXJlIGdlbmVyYXRlZCB0aGUganNvbiBmaWxlLiBcclxuZnVuY3Rpb24gR2V0Q0FEVHlwZShwY2JkYXRhU3RydWN0dXJlKVxyXG57XHJcbiAgICBpZihwY2JkYXRhU3RydWN0dXJlLmhhc093blByb3BlcnR5KFwiZWNhZFwiKSlcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gcGNiZGF0YVN0cnVjdHVyZS5lY2FkO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBUaGlzIHdpbGwgaG9sZCB0aGUgcGFydCBvYmplY3RzLiBUaGVyZSBpcyBvbmUgZW50cnkgcGVyIHBhcnRcclxuLy8gRm9ybWF0IG9mIGEgcGFydCBpcyBhcyBmb2xsb3dzXHJcbi8vIFtWQUxVRSxQQUNLQUdFLFJFRlJFTkVDRSBERVNJR05BVE9SLCAsTE9DQVRJT04sIEFUVFJJQlVURV0sXHJcbi8vIHdoZXJlIEFUVFJJQlVURSBpcyBhIGRpY3Qgb2YgQVRUUklCVVRFIE5BTUUgOiBBVFRSSUJVVEUgVkFMVUVcclxubGV0IEJPTSA9IFtdO1xyXG5cclxuLy8gQ29uc3RydWN0b3IgZm9yIGNyZWF0aW5nIGEgcGFydC5cclxuZnVuY3Rpb24gUGFydCh2YWx1ZSwgZm9vdHByaW50LCByZWZlcmVuY2UsIGxvY2F0aW9uLCBhdHRyaWJ1dGVzLCBjaGVja2JveGVzKVxyXG57XHJcbiAgICB0aGlzLnF1YW50aXR5ICAgPSAxO1xyXG4gICAgdGhpcy52YWx1ZSAgICAgID0gdmFsdWU7XHJcbiAgICB0aGlzLmZvb3RwcmludCAgPSBmb290cHJpbnQ7XHJcbiAgICB0aGlzLnJlZmVyZW5jZSAgPSByZWZlcmVuY2U7XHJcbiAgICB0aGlzLmxvY2F0aW9uICAgPSBsb2NhdGlvbjtcclxuICAgIHRoaXMuYXR0cmlidXRlcyA9IGF0dHJpYnV0ZXM7XHJcbiAgICB0aGlzLmNoZWNrYm94ZXMgPSBjaGVja2JveGVzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBDb3B5UGFydChpbnB1dFBhcnQpXHJcbntcclxuICAgIC8vIFhYWDogVGhpcyBpcyBub3QgcGVyZm9ybWluZyBhIGRlZXAgY29weSwgYXR0cmlidXRlcyBpcyBhIG1hcCBhbmQgdGhpcyBpcyBiZWluZyBjb3BpZWQgYnkgXHJcbiAgICAvLyAgICAgIHJlZmVyZW5jZSB3aGljaCBpcyBub3QgcXVpdGUgd2hhdCB3ZSB3YW50IGhlcmUuIEl0IHNob3VsZCBiZSBhIGRlZXAgY29weSBzbyBvbmNlIGNhbGxlZFxyXG4gICAgLy8gICAgICB0aGlzIHdpbGwgcmVzdWx0IGluIGEgY29tcGxldGVseSBuZXcgb2JqZWN0IHRoYXQgd2lsbCBub3QgcmVmZXJlbmNlIG9uZSBhbm90aGVyXHJcbiAgICByZXR1cm4gbmV3IFBhcnQoaW5wdXRQYXJ0LnZhbHVlLCBpbnB1dFBhcnQucGFja2FnZSwgaW5wdXRQYXJ0LnJlZmVyZW5jZSwgaW5wdXRQYXJ0LmxvY2F0aW9uLCBpbnB1dFBhcnQuYXR0cmlidXRlcywgaW5wdXRQYXJ0LmNoZWNrYm94ZXMpO1xyXG59XHJcblxyXG4vL1RPRE86IFRoZXJlIHNob3VsZCBiZSBzdGVwcyBoZXJlIGZvciB2YWxpZGF0aW5nIHRoZSBkYXRhIGFuZCBwdXR0aW5nIGl0IGludG8gYSBcclxuLy8gICAgICBmb3JtYXQgdGhhdCBpcyB2YWxpZCBmb3Igb3VyIGFwcGxpY2F0aW9uXHJcbmZ1bmN0aW9uIENyZWF0ZUJPTShwY2JkYXRhU3RydWN0dXJlKVxyXG57XHJcbiAgICAvLyBGb3IgZXZlcnkgcGFydCBpbiB0aGUgaW5wdXQgZmlsZSwgY29udmVydCBpdCB0byBvdXIgaW50ZXJuYWwgXHJcbiAgICAvLyByZXByZXNlbnRhdGlvbiBkYXRhIHN0cnVjdHVyZS5cclxuICAgIGZvcihsZXQgcGFydCBvZiBwY2JkYXRhU3RydWN0dXJlLnBhcnRzKVxyXG4gICAge1xyXG4gICAgICAgIC8vIGV4dHJhY3QgdGhlIHBhcnQgZGF0YS4gVGhpcyBpcyBoZXJlIHNvIEkgY2FuIGl0ZXJhdGUgdGhlIGRlc2lnbiBcclxuICAgICAgICAvLyB3aGVuIEkgbWFrZSBjaGFuZ2VzIHRvIHRoZSB1bmRlcmx5aW5nIGpzb24gZmlsZS5cclxuICAgICAgICBsZXQgdmFsdWUgICAgID0gcGFydC52YWx1ZTtcclxuICAgICAgICBsZXQgZm9vdHByaW50ID0gXCJcIjtcclxuICAgICAgICBsZXQgcmVmZXJlbmNlID0gcGFydC5uYW1lO1xyXG4gICAgICAgIGxldCBsb2NhdGlvbiAgPSBwYXJ0LmxvY2F0aW9uO1xyXG5cclxuICAgICAgICAvLyBBdHRyaWJ1dGVOYW1lIGFuZCBBdHRyaWJ1dGVWYWx1ZSBhcmUgdHdvIHN0cmluZ3MgdGhhdCBhcmUgZGVsaW1pbmF0ZWQgYnkgJzsnLiBcclxuICAgICAgICAvLyBTcGxpdCB0aGUgc3RyaW5ncyBieSAnOycgYW5kIHRoZW4gemlwIHRoZW0gdG9nZXRoZXJcclxuICAgICAgICBsZXQgYXR0cmlidXRlTmFtZXMgID0gcGFydC5hdHRyaWJ1dGVzLm5hbWUuc3BsaXQoXCI7XCIpO1xyXG4gICAgICAgIGxldCBhdHRyaWJ1dGVWYWx1ZXMgPSBwYXJ0LmF0dHJpYnV0ZXMudmFsdWUuc3BsaXQoXCI7XCIpO1xyXG5cclxuICAgICAgICBsZXQgY2hlY2tib3hlcyA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICAgICAgLy9YWFg6IEFTU1VNVElPTiB0aGF0IGF0dHJpYnV0ZU5hbWVzIGlzIHRoZSBzYW1lIGxlbmd0aCBhcyBhdHRyaWJ1dGVWYWx1ZXNcclxuICAgICAgICBsZXQgYXR0cmlidXRlcyA9IG5ldyBNYXAoKTsgLy8gQ3JlYXRlIGEgZW1wdHkgZGljdGlvbmFyeVxyXG4gICAgICAgIGZvcihsZXQgaSBpbiBhdHRyaWJ1dGVOYW1lcylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGF0dHJpYnV0ZXMuc2V0KGF0dHJpYnV0ZU5hbWVzW2ldLnRvTG93ZXJDYXNlKCksYXR0cmlidXRlVmFsdWVzW2ldLnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBZGQgdGhlIHBhciB0byB0aGUgZ2xvYmFsIHBhcnQgYXJyYXlcclxuICAgICAgICBCT00ucHVzaChuZXcgUGFydCh2YWx1ZSwgZm9vdHByaW50LCByZWZlcmVuY2UsIGxvY2F0aW9uLCBhdHRyaWJ1dGVzLCBjaGVja2JveGVzKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIEdldEJPTSgpXHJcbntcclxuICAgIHJldHVybiBCT007XHJcbn1cclxuXHJcbi8vIFRBa2VzIGEgQk9NIHRhYmxlIGFuZCBhIGZpbHRlciBmdW5jdGlvbi4gVGhlIGZpbHRlciBcclxuLy8gZnVuY3Rpb24gaXMgdXNlZCBvbnRoZSBwcm92aWRlZCB0YWJsZSB0byByZW1vdmUgXHJcbi8vIGFueSBwYXJ0IHRoYXQgc2F0aXNmeSB0aGUgZmlsdGVyXHJcbmZ1bmN0aW9uIGZpbHRlckJPTVRhYmxlKGJvbXRhYmxlLCBmaWx0ZXJGdW5jdGlvbilcclxue1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG5cclxuICAgIC8vIE1ha2VzIHN1cmUgdGhhdCB0aEUgZmlsdGVyIGZ1bmN0aW9uIGlzIGRlZmluZWQuIFxyXG4gICAgLy8gaWYgbm90IGRlZmluZWQgdGhlbiBub3RoaW5nIHNob3VsZCBiZSBmaWx0ZXJlZC4gXHJcbiAgICBpZihmaWx0ZXJGdW5jdGlvbiAhPSBudWxsKVxyXG4gICAge1xyXG4gICAgICAgIGZvcihsZXQgaSBpbiBib210YWJsZSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIElmIHRoZSBmaWx0ZXIgcmV0dXJucyBmYWxzZSAtPiBkbyBub3QgcmVtb3ZlIHBhcnQsIGl0IGRvZXMgbm90IG5lZWQgdG8gYmUgZmlsdGVyZWRcclxuICAgICAgICAgICAgaWYoIWZpbHRlckZ1bmN0aW9uKGJvbXRhYmxlW2ldKSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goQ29weVBhcnQoYm9tdGFibGVbaV0pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICByZXN1bHQgPSBib210YWJsZTtcclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbi8vIFRha2VzIGEgYm9tIHRhYmxlIGFuZCBjb21iaW5lcyBlbnRyaWVzIHRoYXQgYXJlIHRoZSBzYW1lXHJcbmZ1bmN0aW9uIEdldEJPTUNvbWJpbmVkVmFsdWVzKGJvbXRhYmxlVGVtcClcclxue1xyXG4gICAgbGV0IHJlc3VsdCA9IFtdO1xyXG5cclxuICAgIC8vIFRPRE86IHNvcnQgYm9tdGFibGVUZW1wLiBBc3N1bXB0aW9uIGhlcmUgaXMgdGhhdCB0aGUgYm9tdGFibGVUZW1wIGlzIHByZXNvcnRlZFxyXG5cclxuICAgIGlmKGJvbXRhYmxlVGVtcC5sZW5ndGg+MClcclxuICAgIHtcclxuICAgICAgICAvLyBYWFg6IEFzc3VtaW5nIHRoYXQgdGhlIGlucHV0IGpzb24gZGF0YSBoYXMgYm9tIGVudHJpZXMgcHJlc29ydGVkXHJcbiAgICAgICAgLy8gVE9ETzogU3RhcnQgYXQgaW5kZXggMSwgYW5kIGNvbXBhcmUgdGhlIGN1cnJlbnQgdG8gdGhlIGxhc3QsIHRoaXMgc2hvdWxkIHNpbXBsaWZ5IHRoZSBsb2dpY1xyXG4gICAgICAgIC8vIE5lZWQgdG8gY3JlYXRlIGEgbmV3IG9iamVjdCBieSBkZWVwIGNvcHkuIHRoaXMgaXMgYmVjYXVzZSBvYmplY3RzIGJ5IGRlZmF1bHQgYXJlIHBhc3NlZCBieSByZWZlcmVuY2UgYW5kIGkgZG9udCBcclxuICAgICAgICAvLyB3YW50IHRvIG1vZGlmeSB0aGVtLlxyXG4gICAgICAgIHJlc3VsdC5wdXNoKENvcHlQYXJ0KGJvbXRhYmxlVGVtcFswXSkpO1xyXG4gICAgICAgIGxldCBjb3VudCA9IDA7XHJcbiAgICAgICAgZm9yIChsZXQgbiA9IDE7IG4gPCBib210YWJsZVRlbXAubGVuZ3RoO24rKylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGlmKHJlc3VsdFtjb3VudF0udmFsdWUgPT0gYm9tdGFibGVUZW1wW25dLnZhbHVlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBGb3IgcGFydHMgdGhhdCBhcmUgbGlzdGVkIGFzIGNvbWJpbmVkLCBzdG9yZSB0aGUgcmVmZXJlbmNlcyBhcyBhbiBhcnJheS5cclxuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgYmVjYXVzZSB0aGUgbG9naWMgZm9yIGhpZ2hsaWdodGluZyBuZWVkcyB0byBtYXRjaCBzdHJpbmdzIGFuZCBcclxuICAgICAgICAgICAgICAgIC8vIElmIGFuIGFwcGVuZGVkIHN0cmluZyBpcyB1c2VkIGl0IG1pZ2h0IG5vdCB3b3JrIHJpZ2h0XHJcbiAgICAgICAgICAgICAgICBsZXQgcmVmU3RyaW5nID0gcmVzdWx0W2NvdW50XS5yZWZlcmVuY2UgKyBcIixcIiArIGJvbXRhYmxlVGVtcFtuXS5yZWZlcmVuY2U7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbY291bnRdLnF1YW50aXR5ICs9IDE7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRbY291bnRdLnJlZmVyZW5jZSA9IHJlZlN0cmluZztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKENvcHlQYXJ0KGJvbXRhYmxlVGVtcFtuXSkpO1xyXG4gICAgICAgICAgICAgICAgY291bnQrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEF0dHJpYnV0ZVZhbHVlKHBhcnQsIGF0dHJpYnV0ZVRvTG9va3VwKVxyXG57XHJcbiAgICBsZXQgYXR0cmlidXRlcyA9IHBhcnQuYXR0cmlidXRlcztcclxuICAgIGxldCByZXN1bHQgPSBcIlwiO1xyXG5cclxuICAgIGlmKGF0dHJpYnV0ZVRvTG9va3VwID09IFwibmFtZVwiKVxyXG4gICAge1xyXG4gICAgICAgIHJlc3VsdCA9IHBhcnQucmVmZXJlbmNlO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIHJlc3VsdCA9IChhdHRyaWJ1dGVzLmhhcyhhdHRyaWJ1dGVUb0xvb2t1cCkgPyBhdHRyaWJ1dGVzLmdldChhdHRyaWJ1dGVUb0xvb2t1cCkgOiBcIlwiKTtcclxuICAgIH1cclxuICAgIC8vIENoZWNrIHRoYXQgdGhlIGF0dHJpYnV0ZSBleGlzdHMgYnkgbG9va2luZyB1cCBpdHMgbmFtZS4gSWYgaXQgZXhpc3RzXHJcbiAgICAvLyB0aGUgcmV0dXJuIHRoZSB2YWx1ZSBmb3IgdGhlIGF0dHJpYnV0ZSwgb3RoZXJ3aXNlIHJldHVybiBhbiBlbXB0eSBzdHJpbmcuIFxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuXHJcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBQQ0IgTWV0YWRhdGEgSW50ZXJmYWNlc1xyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmxldCBtZXRhZGF0YTtcclxuLy8gQ29uc3RydWN0b3IgZm9yIGNyZWF0aW5nIGEgcGFydC5cclxuZnVuY3Rpb24gTWV0YWRhdGEodGl0bGUsIHJldmlzaW9uLCBjb21wYW55LCBkYXRlKSBcclxue1xyXG4gICAgdGhpcy50aXRsZSAgICA9IHRpdGxlO1xyXG4gICAgdGhpcy5yZXZpc2lvbiA9IHJldmlzaW9uO1xyXG4gICAgdGhpcy5jb21wYW55ICA9IGNvbXBhbnk7XHJcbiAgICB0aGlzLmRhdGUgICAgID0gZGF0ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gQ3JlYXRlTWV0YWRhdGEocGNiZGF0YVN0cnVjdHVyZSlcclxue1xyXG4gICAgbWV0YWRhdGEgPSBuZXcgTWV0YWRhdGEoIFxyXG4gICAgICAgIHBjYmRhdGFTdHJ1Y3R1cmUubWV0YWRhdGEucHJvamVjdF9uYW1lLCBwY2JkYXRhU3RydWN0dXJlLm1ldGFkYXRhLnJldmlzaW9uLFxyXG4gICAgICAgIHBjYmRhdGFTdHJ1Y3R1cmUubWV0YWRhdGEuY29tcGFueSAgICAgLCBwY2JkYXRhU3RydWN0dXJlLm1ldGFkYXRhLmRhdGVcclxuICAgICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIEdldE1ldGFkYXRhKClcclxue1xyXG4gICAgcmV0dXJuIG1ldGFkYXRhO1xyXG59XHJcblxyXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUENCIExheWVycyBJbnRlcmZhY2VzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxubGV0IExheWVycyA9IFtdO1xyXG5sZXQgbGF5ZXJfWmluZGV4ID0gMDtcclxuXHJcbmZ1bmN0aW9uIEdldExheWVycygpXHJcbntcclxuICAgIHJldHVybiBMYXllcnM7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBQQ0JMYXllcihuYW1lKVxyXG57XHJcbiAgICB0aGlzLm5hbWUgICAgPSBuYW1lO1xyXG4gICAgdGhpcy52aXNpYmxlX2Zyb250ID0gdHJ1ZTtcclxuICAgIHRoaXMudmlzaWJsZV9iYWNrID0gdHJ1ZTtcclxuXHJcblxyXG4gICAgdGhpcy5mcm9udF9pZCA9IFwibGF5ZXJfZnJvbnRfXCIgKyBuYW1lO1xyXG4gICAgdGhpcy5iYWNrX2lkICA9IFwibGF5ZXJfcmVhcl9cIiArIG5hbWU7XHJcblxyXG4gICAgbGV0IGNhbnZhc19mcm9udCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZnJvbnQtY2FudmFzLWxpc3RcIik7XHJcbiAgICBsZXQgbGF5ZXJfZnJvbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xyXG4gICAgbGF5ZXJfZnJvbnQuaWQgPSB0aGlzLmZyb250X2lkO1xyXG4gICAgbGF5ZXJfZnJvbnQuc3R5bGUuekluZGV4ID0gbGF5ZXJfWmluZGV4O1xyXG4gICAgbGF5ZXJfZnJvbnQuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XHJcbiAgICBsYXllcl9mcm9udC5zdHlsZS5sZWZ0ID0gMDtcclxuICAgIGxheWVyX2Zyb250LnN0eWxlLnRvcCA9IDA7XHJcbiAgICBjYW52YXNfZnJvbnQuYXBwZW5kQ2hpbGQobGF5ZXJfZnJvbnQpO1xyXG5cclxuXHJcbiAgICBsZXQgY2FudmFzX2JhY2sgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImJhY2stY2FudmFzLWxpc3RcIik7XHJcbiAgICBsZXQgbGF5ZXJfYmFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XHJcbiAgICBsYXllcl9iYWNrLmlkID0gdGhpcy5iYWNrX2lkO1xyXG4gICAgbGF5ZXJfYmFjay5zdHlsZS56SW5kZXggPSBsYXllcl9aaW5kZXg7XHJcbiAgICBsYXllcl9iYWNrLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xyXG4gICAgbGF5ZXJfYmFjay5zdHlsZS5sZWZ0ID0gMDtcclxuICAgIGxheWVyX2JhY2suc3R5bGUudG9wID0gMDtcclxuXHJcbiAgICBjYW52YXNfYmFjay5hcHBlbmRDaGlsZChsYXllcl9iYWNrKTtcclxuXHJcbiAgICBsYXllcl9aaW5kZXggPSBsYXllcl9aaW5kZXggKyAxO1xyXG59XHJcblxyXG5mdW5jdGlvbiBTZXRMYXllclZpc2liaWxpdHkobGF5ZXJOYW1lLCBpc0Zyb250LCB2aXNpYmxlKVxyXG57XHJcbiAgICBsZXQgbGF5ZXJJbmRleCA9IExheWVycy5maW5kSW5kZXgoaSA9PiBpLm5hbWUgPT09IGxheWVyTmFtZSk7XHJcbiAgICBpZihpc0Zyb250KVxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIGl0ZW0gaXMgbm90IGluIHRoZSBsaXN0IFxyXG4gICAgICAgIGlmKCBsYXllckluZGV4ICE9PSAtMSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIExheWVyIGV4aXN0cy4gQ2hlY2sgaWYgdmlzaWJsZVxyXG4gICAgICAgICAgICBMYXllcnNbbGF5ZXJJbmRleF0udmlzaWJsZV9mcm9udCA9IHZpc2libGU7XHJcblxyXG4gICAgICAgICAgICAvLyBUT0RPOiBSZWZhY3RvciB0aGlzLiBiZWxvdyBpcyB1c2VkIHRvIGludGVyZmFjZSBiZXR3ZWVuIHRoZSBkaWZmZXJlbnQgbGF5ZXIgXHJcbiAgICAgICAgICAgIC8vIHNldHVwcyB0aGF0IGFyZSBjdXJyZW50bHkgYmVpbmcgdXNlZCBidXQgb25jZSBzd2l0Y2hlZCB0byB0aGUgbmV3IGxheWVyIGZvcm1hdFxyXG4gICAgICAgICAgICAvLyB0aGVuIHRoZSBhYm92ZSB3aWxsIG5vdCBiZSBuZWVkZWQuXHJcbiAgICAgICAgICAgIGxldCBjYW52YXMgPSB1bmRlZmluZWQ7IFxyXG4gICAgICAgICAgICBpZih2aXNpYmxlKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChMYXllcnNbbGF5ZXJJbmRleF0uZnJvbnRfaWQpO1xyXG4gICAgICAgICAgICAgICAgY2FudmFzLnN0eWxlLmRpc3BsYXk9XCJcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKExheWVyc1tsYXllckluZGV4XS5mcm9udF9pZCk7XHJcbiAgICAgICAgICAgICAgICBjYW52YXMuc3R5bGUuZGlzcGxheT1cIm5vbmVcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICAvLyBJZiBpdGVtIGlzIG5vdCBpbiB0aGUgbGlzdCBcclxuICAgICAgICBpZiggbGF5ZXJJbmRleCAhPT0gLTEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBMYXllciBleGlzdHMuIENoZWNrIGlmIHZpc2libGVcclxuICAgICAgICAgICAgTGF5ZXJzW2xheWVySW5kZXhdLnZpc2libGVfYmFjayA9IHZpc2libGU7XHJcblxyXG4gICAgICAgICAgICAvLyBUT0RPOiBSZWZhY3RvciB0aGlzLiBiZWxvdyBpcyB1c2VkIHRvIGludGVyZmFjZSBiZXR3ZWVuIHRoZSBkaWZmZXJlbnQgbGF5ZXIgXHJcbiAgICAgICAgICAgIC8vIHNldHVwcyB0aGF0IGFyZSBjdXJyZW50bHkgYmVpbmcgdXNlZCBidXQgb25jZSBzd2l0Y2hlZCB0byB0aGUgbmV3IGxheWVyIGZvcm1hdFxyXG4gICAgICAgICAgICAvLyB0aGVuIHRoZSBhYm92ZSB3aWxsIG5vdCBiZSBuZWVkZWQuXHJcbiAgICAgICAgICAgIGxldCBjYW52YXMgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGlmKHZpc2libGUpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhbnZhcz0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTGF5ZXJzW2xheWVySW5kZXhdLmJhY2tfaWQpO1xyXG4gICAgICAgICAgICAgICAgY2FudmFzLnN0eWxlLmRpc3BsYXk9XCJcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhbnZhcz0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTGF5ZXJzW2xheWVySW5kZXhdLmJhY2tfaWQpO1xyXG4gICAgICAgICAgICAgICAgY2FudmFzLnN0eWxlLmRpc3BsYXk9XCJub25lXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIEdldExheWVyQ2FudmFzKGxheWVyTmFtZSwgaXNGcm9udClcclxue1xyXG4gICAgLy8gR2V0IHRoZSBpbmRleCBvZiB0aGUgUENCIGxheWVyIFxyXG4gICAgLy8gTUFwIHVzZWQgaGVyZSB0byBjcmVhdGUgYSBsaXN0IG9mIGp1c3QgdGhlIGxheWVyIG5hbWVzLCB3aGljaCBpbmRleE9mIGNhbiB0aGVuICBiZSB1c2VkIGFnYWluc3QuXHJcbiAgICBsZXQgaW5kZXggPSBMYXllcnMubWFwKGZ1bmN0aW9uKGUpIHsgcmV0dXJuIGUubmFtZTsgfSkuaW5kZXhPZihsYXllck5hbWUpO1xyXG4gICAgLy8gUmVxdWVzdGVkIGxheWVyIGRvZXMgbm90IGV4aXN0LiBDcmVhdGUgbmV3IGxheWVyXHJcbiAgICBpZihpbmRleCA9PT0gLTEpXHJcbiAgICB7XHJcbiAgICAgICAgLy8gQWRkcyBsYXllciB0byBsYXllciBzdGFja1xyXG4gICAgICAgIExheWVycy5wdXNoKG5ldyBQQ0JMYXllcihsYXllck5hbWUpKTtcclxuICAgICAgICBpbmRleCA9IExheWVycy5sZW5ndGgtMTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSZXR1cm4gdGhlIGNhbnZhcyBpbnN0YW5jZVxyXG4gICAgaWYoaXNGcm9udClcclxuICAgIHtcclxuICAgICAgICByZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTGF5ZXJzW2luZGV4XS5mcm9udF9pZCk7XHJcbiAgICB9IFxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChMYXllcnNbaW5kZXhdLmJhY2tfaWQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBDcmVhdGVMYXllcnMocGNiZGF0YVN0cnVjdHVyZSlcclxue1xyXG4gICAgLy8gRXh0cmFjdCBsYXllcnMgZnJvbSB0aGUgdHJhY2Ugc2VjdGlvblxyXG4gICAgZm9yKCBsZXQgdHJhY2Ugb2YgcGNiZGF0YVN0cnVjdHVyZS5ib2FyZC50cmFjZXMpXHJcbiAgICB7XHJcbiAgICAgICAgZm9yKGxldCBzZWdtZW50IG9mIHRyYWNlLnNlZ21lbnRzKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgdGhhdCBzZWdtZW50IGNvbnRhaW5zIGEgbGF5ZXIgZGVmaW5pdGlvblxyXG4gICAgICAgICAgICBpZihzZWdtZW50LmxheWVyKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAvLyBJZiBpdGVtIGlzIG5vdCBpbiB0aGUgbGlzdCBcclxuICAgICAgICAgICAgICAgIGlmKExheWVycy5maW5kSW5kZXgoaSA9PiBpLm5hbWUgPT09IHNlZ21lbnQubGF5ZXIpID09PSAtMSlcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBMYXllcnMucHVzaChuZXcgUENCTGF5ZXIoc2VnbWVudC5sYXllcikpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEV4dHJhY3QgbGF5ZXJzIGZvcm0gdGhlIGxheWVycyBzZWN0aW9uXHJcbiAgICBmb3IobGV0IGxheWVyIG9mIHBjYmRhdGFTdHJ1Y3R1cmUuYm9hcmQubGF5ZXJzKVxyXG4gICAge1xyXG4gICAgICAgIC8vIElmIGl0ZW0gaXMgbm90IGluIHRoZSBsaXN0IFxyXG4gICAgICAgIGlmKExheWVycy5maW5kSW5kZXgoaSA9PiBpLm5hbWUgPT09IGxheWVyLm5hbWUpID09PSAtMSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEFkZCB0aGUgcGFyIHRvIHRoZSBnbG9iYWwgcGFydCBhcnJheVxyXG4gICAgICAgICAgICBMYXllcnMucHVzaChuZXcgUENCTGF5ZXIobGF5ZXIubmFtZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBYWFg6IE5lZWQgYW5vdGhlciB3YXkgdG8gZXh0cmFjdCBhbGwgbGF5ZXJzIGZyb20gaW5wdXRcclxuICAgIExheWVycy5wdXNoKG5ldyBQQ0JMYXllcihcImVkZ2VzXCIpKTtcclxuICAgIExheWVycy5wdXNoKG5ldyBQQ0JMYXllcihcInBhZHNcIikpO1xyXG4gICAgTGF5ZXJzLnB1c2gobmV3IFBDQkxheWVyKFwiaGlnaGxpZ2h0c1wiKSk7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBJc0xheWVyVmlzaWJsZShsYXllck5hbWUsIGlzRnJvbnQpXHJcbntcclxuICAgIGxldCByZXN1bHQgPSB0cnVlO1xyXG4gICAgbGV0IGxheWVySW5kZXggPSBMYXllcnMuZmluZEluZGV4KGkgPT4gaS5uYW1lID09PSBsYXllck5hbWUpO1xyXG5cclxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCB0aGUgbGF5ZXIgaXMgYWx3YXlzIHZpc2libGUuIFxyXG4gICAgaWYobGF5ZXJOYW1lID09IFwiYWxsXCIpXHJcbiAgICB7XHJcbiAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYoaXNGcm9udClcclxuICAgIHtcclxuICAgICAgICAvLyBJZiBpdGVtIGlzIG5vdCBpbiB0aGUgbGlzdCBcclxuICAgICAgICBpZiggbGF5ZXJJbmRleCA9PT0gLTEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXN1bHQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gTGF5ZXIgZXhpc3RzLiBDaGVjayBpZiB2aXNpYmxlXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IExheWVyc1tsYXllckluZGV4XS52aXNpYmxlX2Zyb250O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICAvLyBJZiBpdGVtIGlzIG5vdCBpbiB0aGUgbGlzdCBcclxuICAgICAgICBpZiggbGF5ZXJJbmRleCA9PT0gLTEpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICByZXN1bHQgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgLy8gTGF5ZXIgZXhpc3RzLiBDaGVjayBpZiB2aXNpYmxlXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IExheWVyc1tsYXllckluZGV4XS52aXNpYmxlX2JhY2s7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIE9wZW5QY2JEYXRhKHBjYmRhdGEpXHJcbntcclxuICAgIENyZWF0ZUJPTShwY2JkYXRhKTtcclxuICAgIENyZWF0ZU1ldGFkYXRhKHBjYmRhdGEpO1xyXG4gICAgQ3JlYXRlTGF5ZXJzKHBjYmRhdGEpO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIE9wZW5QY2JEYXRhLCBHZXRCT00sIGdldEF0dHJpYnV0ZVZhbHVlLCBHZXRCT01Db21iaW5lZFZhbHVlcywgZmlsdGVyQk9NVGFibGUsIEdldE1ldGFkYXRhLCBcclxuICAgIEdldExheWVycywgSXNMYXllclZpc2libGUsIFNldExheWVyVmlzaWJpbGl0eSwgR2V0TGF5ZXJDYW52YXMsIEdldENBRFR5cGVcclxufTsiLCIvKiBQQ0IgcmVuZGVyaW5nIGNvZGUgKi9cclxuXHJcblwidXNlIHN0cmljdFwiO1xyXG5cclxudmFyIGdsb2JhbERhdGEgICAgICAgICA9IHJlcXVpcmUoXCIuL2dsb2JhbC5qc1wiKTtcclxudmFyIHJlbmRlcl9wYWRzICAgICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlci9yZW5kZXJfcGFkLmpzXCIpO1xyXG52YXIgcmVuZGVyX3ZpYSAgICAgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyL3JlbmRlcl92aWEuanNcIik7XHJcbnZhciByZW5kZXJfdHJhY2UgICAgICAgPSByZXF1aXJlKFwiLi9yZW5kZXIvcmVuZGVyX3RyYWNlLmpzXCIpO1xyXG52YXIgcmVuZGVyX2JvYXJkZWRnZSAgID0gcmVxdWlyZShcIi4vcmVuZGVyL3JlbmRlcl9ib2FyZGVkZ2UuanNcIik7XHJcbnZhciByZW5kZXJfc2lsa3NjcmVlbiAgPSByZXF1aXJlKFwiLi9yZW5kZXIvcmVuZGVyX3NpbGtzY3JlZW4uanNcIik7XHJcbnZhciByZW5kZXJfY2FudmFzICAgICAgPSByZXF1aXJlKFwiLi9yZW5kZXIvcmVuZGVyX2NhbnZhcy5qc1wiKTtcclxudmFyIHJlbmRlcl9ib3VuZGluZ2JveCA9IHJlcXVpcmUoXCIuL3JlbmRlci9yZW5kZXJfYm91bmRpbmdib3guanNcIik7XHJcbnZhciBQb2ludCAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9yZW5kZXIvcG9pbnQuanNcIikuUG9pbnQ7XHJcbnZhciBwY2IgICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9wY2IuanNcIik7XHJcbnZhciBjb2xvck1hcCAgICAgICAgICAgPSByZXF1aXJlKFwiLi9jb2xvcm1hcC5qc1wiKTtcclxuXHJcblxyXG4vL1JFTU9WRTogVXNpbmcgdG8gdGVzdCBhbHRlcm5hdGUgcGxhY2VkIGNvbG9yaW5nXHJcbmxldCBpc1BsYWNlZCA9IGZhbHNlO1xyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBEcmF3UGFkKGN0eCwgcGFkLCBjb2xvcikgXHJcbntcclxuICAgIGlmIChwYWQuc2hhcGUgPT0gXCJyZWN0XCIpIFxyXG4gICAge1xyXG4gICAgICAgIHJlbmRlcl9wYWRzLlJlY3RhbmdsZShjdHgsIHBhZCwgY29sb3IpO1xyXG4gICAgfSBcclxuICAgIGVsc2UgaWYgKHBhZC5zaGFwZSA9PSBcIm9ibG9uZ1wiKSBcclxuICAgIHtcclxuICAgICAgICByZW5kZXJfcGFkcy5PYmxvbmcoY3R4LCBwYWQsIGNvbG9yKTtcclxuICAgIH0gXHJcbiAgICBlbHNlIGlmIChwYWQuc2hhcGUgPT0gXCJyb3VuZFwiKSBcclxuICAgIHtcclxuICAgICAgICByZW5kZXJfcGFkcy5Sb3VuZChjdHgsIHBhZCwgY29sb3IpO1xyXG4gICAgfSBcclxuICAgIGVsc2UgaWYgKHBhZC5zaGFwZSA9PSBcIm9jdGFnb25cIikgXHJcbiAgICB7XHJcbiAgICAgICAgcmVuZGVyX3BhZHMuT2N0YWdvbihjdHgsIHBhZCwgY29sb3IpO1xyXG4gICAgfSBcclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkVSUk9SOiBVbnN1cHBvcnRlZCBwYWQgdHlwZSBcIiwgcGFkLnNoYXBlKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gRHJhd1BDQkVkZ2VzKGlzVmlld0Zyb250LCBzY2FsZWZhY3RvcikgXHJcbntcclxuICAgIGxldCBjdHggPSBwY2IuR2V0TGF5ZXJDYW52YXMoXCJlZGdlc1wiLCBpc1ZpZXdGcm9udCkuZ2V0Q29udGV4dChcIjJkXCIpO1xyXG4gICAgbGV0IGNvbG9yID0gY29sb3JNYXAuR2V0UENCRWRnZUNvbG9yKCk7XHJcblxyXG4gICAgZm9yIChsZXQgZWRnZSBvZiBwY2JkYXRhLmJvYXJkLnBjYl9zaGFwZS5lZGdlcykgXHJcbiAgICB7XHJcbiAgICAgICAgaWYoZWRnZS5wYXRodHlwZSA9PSBcImxpbmVcIilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBsaW5lV2lkdGggPSBNYXRoLm1heCgxIC8gc2NhbGVmYWN0b3IsIGVkZ2Uud2lkdGgpO1xyXG4gICAgICAgICAgICByZW5kZXJfYm9hcmRlZGdlLkxpbmUoY3R4LCBlZGdlLCBsaW5lV2lkdGgsIGNvbG9yKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZihlZGdlLnBhdGh0eXBlID09IFwiYXJjXCIpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBsZXQgbGluZVdpZHRoID0gTWF0aC5tYXgoMSAvIHNjYWxlZmFjdG9yLCBlZGdlLndpZHRoKTtcclxuICAgICAgICAgICAgcmVuZGVyX2JvYXJkZWRnZS5BcmMoY3R4LCBlZGdlLCBsaW5lV2lkdGgsIGNvbG9yKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJ1bnN1cHBvcnRlZCBib2FyZCBlZGdlIHNlZ21lbnQgdHlwZVwiLCBlZGdlLnBhdGh0eXBlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIERyYXdUcmFjZXMoaXNWaWV3RnJvbnQsIHNjYWxlZmFjdG9yKVxyXG57XHJcbiAgICAvLyBJdGVyYXRlIG92ZXIgYWxsIHRyYWNlcyBpbiB0aGUgZGVzaWduXHJcbiAgICBmb3IgKGxldCB0cmFjZSBvZiBwY2JkYXRhLmJvYXJkLnRyYWNlcylcclxuICAgIHtcclxuICAgICAgICAvLyBpdGVyYXRlIG92ZXIgYWxsIHNlZ21lbnRzIGluIGEgdHJhY2UgXHJcbiAgICAgICAgZm9yIChsZXQgc2VnbWVudCBvZiB0cmFjZS5zZWdtZW50cylcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjdHggPSBwY2IuR2V0TGF5ZXJDYW52YXMoc2VnbWVudC5sYXllciwgaXNWaWV3RnJvbnQpLmdldENvbnRleHQoXCIyZFwiKVxyXG5cclxuICAgICAgICAgICAgaWYoc2VnbWVudC5wYXRodHlwZSA9PSBcImxpbmVcIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGxpbmVXaWR0aCA9IE1hdGgubWF4KDEgLyBzY2FsZWZhY3Rvciwgc2VnbWVudC53aWR0aCk7XHJcbiAgICAgICAgICAgICAgICByZW5kZXJfdHJhY2UuTGluZShjdHgsIHNlZ21lbnQsIGxpbmVXaWR0aCwgY29sb3JNYXAuR2V0VHJhY2VDb2xvcihzZWdtZW50LmxheWVyTnVtYmVyLTEpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmKHNlZ21lbnQucGF0aHR5cGUgPT0gXCJhcmNcIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGxpbmVXaWR0aCA9IE1hdGgubWF4KDEgLyBzY2FsZWZhY3Rvciwgc2VnbWVudC53aWR0aCk7XHJcbiAgICAgICAgICAgICAgICByZW5kZXJfdHJhY2UuQXJjKGN0eCwgc2VnbWVudCwgbGluZVdpZHRoLCBjb2xvck1hcC5HZXRUcmFjZUNvbG9yKHNlZ21lbnQubGF5ZXJOdW1iZXItMSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHNlZ21lbnQucGF0aHR5cGUgPT0gXCJwb2x5Z29uXCIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBsaW5lV2lkdGggPSBNYXRoLm1heCgxIC8gc2NhbGVmYWN0b3IsIHNlZ21lbnQud2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgLy8gTmVlZCB0byBzcGVjaWZ5IGEgY29sb3IgYXQgZnVsbCB0cmFuc3BhcmVuY3kgc28gdGhhdCBhIG5lZ2F0aXZlIHBvbHlnb24gXHJcbiAgICAgICAgICAgICAgICAvLyBjYW4gYmUgc3VidHJhY3RlZCBmcm9tIGEgcG9zaXRpdmUgcG9seWdvbi5cclxuICAgICAgICAgICAgICAgIGxldCBjb2xvciA9IChzZWdtZW50LnBvc2l0aXZlID09IDEpID8gY29sb3JNYXAuR2V0VHJhY2VDb2xvcihzZWdtZW50LmxheWVyTnVtYmVyLTEpIDogXCIjMDAwMDAwRkZcIjtcclxuICAgICAgICAgICAgICAgIHJlbmRlcl90cmFjZS5Qb2x5Z29uKGN0eCwgc2VnbWVudC5zZWdtZW50cywgbGluZVdpZHRoLCBjb2xvciwgc2VnbWVudC5wb3NpdGl2ZSA9PT0gXCIxXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYoIHNlZ21lbnQucGF0aHR5cGUgPT0gXCJ2aWFfcm91bmRcIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KHNlZ21lbnQueCwgc2VnbWVudC55KTtcclxuICAgICAgICAgICAgICAgIHJlbmRlcl92aWEuUm91bmQoXHJcbiAgICAgICAgICAgICAgICAgICAgY3R4XHJcbiAgICAgICAgICAgICAgICAgICAgLCBjZW50ZXJQb2ludFxyXG4gICAgICAgICAgICAgICAgICAgICwgc2VnbWVudC5kaWFtZXRlclxyXG4gICAgICAgICAgICAgICAgICAgICwgc2VnbWVudC5kcmlsbFxyXG4gICAgICAgICAgICAgICAgICAgICwgY29sb3JNYXAuR2V0VmlhQ29sb3IoKVxyXG4gICAgICAgICAgICAgICAgICAgICwgY29sb3JNYXAuR2V0RHJpbGxDb2xvcigpXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYoIHNlZ21lbnQucGF0aHR5cGUgPT0gXCJ2aWFfb2N0YWdvblwiKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2VudGVyUG9pbnQgPSBuZXcgUG9pbnQoc2VnbWVudC54LCBzZWdtZW50LnkpO1xyXG4gICAgICAgICAgICAgICAgcmVuZGVyX3ZpYS5PY3RhZ29uKFxyXG4gICAgICAgICAgICAgICAgICAgIGN0eFxyXG4gICAgICAgICAgICAgICAgICAgICwgY2VudGVyUG9pbnRcclxuICAgICAgICAgICAgICAgICAgICAsIHNlZ21lbnQuZGlhbWV0ZXJcclxuICAgICAgICAgICAgICAgICAgICAsIHNlZ21lbnQuZHJpbGxcclxuICAgICAgICAgICAgICAgICAgICAsIGNvbG9yTWFwLkdldFZpYUNvbG9yKClcclxuICAgICAgICAgICAgICAgICAgICAsIGNvbG9yTWFwLkdldERyaWxsQ29sb3IoKVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmKCBzZWdtZW50LnBhdGh0eXBlID09IFwidmlhX3NxdWFyZVwiKVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBsZXQgY2VudGVyUG9pbnQgPSBuZXcgUG9pbnQoc2VnbWVudC54LCBzZWdtZW50LnkpO1xyXG4gICAgICAgICAgICAgICAgcmVuZGVyX3ZpYS5TcXVhcmUoXHJcbiAgICAgICAgICAgICAgICAgICAgY3R4XHJcbiAgICAgICAgICAgICAgICAgICAgLCBjZW50ZXJQb2ludFxyXG4gICAgICAgICAgICAgICAgICAgICwgc2VnbWVudC5kaWFtZXRlclxyXG4gICAgICAgICAgICAgICAgICAgICwgc2VnbWVudC5kcmlsbFxyXG4gICAgICAgICAgICAgICAgICAgICwgY29sb3JNYXAuR2V0VmlhQ29sb3IoKVxyXG4gICAgICAgICAgICAgICAgICAgICwgY29sb3JNYXAuR2V0RHJpbGxDb2xvcigpXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJ1bnN1cHBvcnRlZCB0cmFjZSBzZWdtZW50IHR5cGVcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIERyYXdTaWxrc2NyZWVuKGlzVmlld0Zyb250LCBzY2FsZWZhY3Rvcilcclxue1xyXG4gICAgbGV0IGNvbG9yID0gXCIjYWE0XCI7XHJcblxyXG4gICAgZm9yIChsZXQgbGF5ZXIgb2YgcGNiZGF0YS5ib2FyZC5sYXllcnMpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGN0eCA9IHBjYi5HZXRMYXllckNhbnZhcyhsYXllci5uYW1lLCBpc1ZpZXdGcm9udCkuZ2V0Q29udGV4dChcIjJkXCIpO1xyXG5cclxuICAgICAgIGlmKGxheWVyLmxheWVyTnVtYmVyLTEgPCAxNilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNvbG9yID0gY29sb3JNYXAuR2V0VHJhY2VDb2xvcihsYXllci5sYXllck51bWJlci0xKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY29sb3IgPSBcIiNhYTRcIlxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGxldCBwYXRoIG9mIGxheWVyLnBhdGhzKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgaWYocGF0aC5wYXRodHlwZSA9PSBcImxpbmVcIilcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbGV0IGxpbmVXaWR0aCA9IE1hdGgubWF4KDEgLyBzY2FsZWZhY3RvciwgcGF0aC53aWR0aCk7XHJcbiAgICAgICAgICAgICAgICByZW5kZXJfc2lsa3NjcmVlbi5MaW5lKGN0eCwgcGF0aCwgbGluZVdpZHRoLCBjb2xvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZihwYXRoLnBhdGh0eXBlID09IFwiYXJjXCIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBsaW5lV2lkdGggPSBNYXRoLm1heCgxIC8gc2NhbGVmYWN0b3IsIHBhdGgud2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgcmVuZGVyX3NpbGtzY3JlZW4uQXJjKGN0eCwgcGF0aCwgbGluZVdpZHRoLCBjb2xvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZihwYXRoLnBhdGh0eXBlID09IFwiY2lyY2xlXCIpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBsaW5lV2lkdGggPSBNYXRoLm1heCgxIC8gc2NhbGVmYWN0b3IsIHBhdGgud2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgcmVuZGVyX3NpbGtzY3JlZW4uQ2lyY2xlKGN0eCwgcGF0aCwgbGluZVdpZHRoLCBjb2xvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcInVuc3VwcG9ydGVkIHNpbGtzY3JlZW4gcGF0aCBzZWdtZW50IHR5cGVcIiwgcGF0aC5wYXRodHlwZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIERyYXdNb2R1bGUoaXNWaWV3RnJvbnQsIGxheWVyLCBzY2FsZWZhY3RvciwgcGFydCwgaGlnaGxpZ2h0KSBcclxue1xyXG4gICAgaWYgKGhpZ2hsaWdodCB8fCBnbG9iYWxEYXRhLmdldERlYnVnTW9kZSgpKVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjdHggPSBwY2IuR2V0TGF5ZXJDYW52YXMoXCJoaWdobGlnaHRzXCIsIGlzVmlld0Zyb250KS5nZXRDb250ZXh0KFwiMmRcIik7XHJcbiAgICAgICAgLy8gZHJhdyBib3VuZGluZyBib3hcclxuICAgICAgICBpZiAocGFydC5sb2NhdGlvbiA9PSBsYXllcilcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGxldCBjb2xvcl9Cb3VuZGluZ0JveCA9IGNvbG9yTWFwLkdldEJvdW5kaW5nQm94Q29sb3IoaGlnaGxpZ2h0LCBpc1BsYWNlZCk7XHJcbiAgICAgICAgICAgIHJlbmRlcl9ib3VuZGluZ2JveC5SZWN0YW5nbGUoY3R4LCBwYXJ0LnBhY2thZ2UuYm91bmRpbmdfYm94LCBjb2xvcl9Cb3VuZGluZ0JveCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIGRyYXcgcGFkc1xyXG4gICAgICAgIGZvciAobGV0IHBhZCBvZiBwYXJ0LnBhY2thZ2UucGFkcykgXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICAvKlxyXG4gICAgICAgICAgICAgICAgQ2hlY2sgdGhhdCBwYXJ0IG9uIGxheWVyIHNob3VsZCBiZSBkcmF3bi4gV2lsbCBkcmF3IHdoZW4gcmVxdWVzdGVkIGxheWVyIFxyXG4gICAgICAgICAgICAgICAgbWF0Y2hlcyB0aGUgcGFydHMgbGF5ZXIuXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgIElmIHRoZSBwYXJ0IGlzIHRocm91Z2ggaG9sZSBpdCBuZWVkcyB0byBiZSBkcmF3biBvbiBlYWNoIGxheWVyXHJcbiAgICAgICAgICAgICAgb3RoZXJ3aXNlIHRoZSBwYXJ0IGlzIGFuIHNtZCBhbmQgc2hvdWxkIG9ubHkgYmUgZHJhd24gb24gYSB0aGUgbGF5ZXIgaXQgYmVsb25ncyB0by5cclxuICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgaWYgKCAgICAocGFkLnBhZF90eXBlID09IFwidGh0XCIpXHJcbiAgICAgICAgICAgICAgICAgfHwgKChwYWQucGFkX3R5cGUgPT0gXCJzbWRcIikgJiYgKHBhcnQubG9jYXRpb24gPT0gbGF5ZXIpKVxyXG4gICAgICAgICAgICApXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGxldCBoaWdobGlnaHRQaW4xID0gKChwYWQucGluMSA9PSBcInllc1wiKSAgJiYgZ2xvYmFsRGF0YS5nZXRIaWdobGlnaHRQaW4xKCkpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGNvbG9yX3BhZCA9IGNvbG9yTWFwLkdldFBhZENvbG9yKGhpZ2hsaWdodFBpbjEsIGhpZ2hsaWdodCwgaXNQbGFjZWQpO1xyXG4gICAgICAgICAgICAgICAgRHJhd1BhZChjdHgsIHBhZCwgY29sb3JfcGFkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBkcmF3IHBhZHNcclxuICAgIGZvciAobGV0IHBhZCBvZiBwYXJ0LnBhY2thZ2UucGFkcykgXHJcbiAgICB7XHJcbiAgICAgICAgLypcclxuICAgICAgICAgICAgQ2hlY2sgdGhhdCBwYXJ0IG9uIGxheWVyIHNob3VsZCBiZSBkcmF3bi4gV2lsbCBkcmF3IHdoZW4gcmVxdWVzdGVkIGxheWVyIFxyXG4gICAgICAgICAgICBtYXRjaGVzIHRoZSBwYXJ0cyBsYXllci5cclxuICAgICAgICBcclxuICAgICAgICAgIElmIHRoZSBwYXJ0IGlzIHRocm91Z2ggaG9sZSBpdCBuZWVkcyB0byBiZSBkcmF3biBvbiBlYWNoIGxheWVyXHJcbiAgICAgICAgICBvdGhlcndpc2UgdGhlIHBhcnQgaXMgYW4gc21kIGFuZCBzaG91bGQgb25seSBiZSBkcmF3biBvbiBhIHRoZSBsYXllciBpdCBiZWxvbmdzIHRvLlxyXG4gICAgICAgICovXHJcbiAgICAgICAgaWYgKCAgICAocGFkLnBhZF90eXBlID09IFwidGh0XCIpXHJcbiAgICAgICAgICAgICB8fCAoKHBhZC5wYWRfdHlwZSA9PSBcInNtZFwiKSAmJiAocGFydC5sb2NhdGlvbiA9PSBsYXllcikpXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgbGV0IGhpZ2hsaWdodFBpbjEgPSAoKHBhZC5waW4xID09IFwieWVzXCIpICAmJiBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodFBpbjEoKSk7XHJcbiAgICAgICAgICAgIGxldCBjb2xvcl9wYWQgPSBjb2xvck1hcC5HZXRQYWRDb2xvcihoaWdobGlnaHRQaW4xLCBmYWxzZSwgaXNQbGFjZWQpO1xyXG4gICAgICAgICAgICBsZXQgY3R4ID0gcGNiLkdldExheWVyQ2FudmFzKFwicGFkc1wiLCBpc1ZpZXdGcm9udCkuZ2V0Q29udGV4dChcIjJkXCIpO1xyXG4gICAgICAgICAgICBEcmF3UGFkKGN0eCwgcGFkLCBjb2xvcl9wYWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gRHJhd01vZHVsZXMoaXNWaWV3RnJvbnQsIGxheWVyLCBzY2FsZWZhY3RvciwgaGlnaGxpZ2h0ZWRSZWZzKVxyXG57XHJcbiAgICBmb3IgKGxldCBwYXJ0IG9mIHBjYmRhdGEucGFydHMpIFxyXG4gICAge1xyXG4gICAgICAgIGxldCBoaWdobGlnaHQgPSBoaWdobGlnaHRlZFJlZnMuaW5jbHVkZXMocGFydC5uYW1lKTtcclxuICAgICAgICBpZiAoaGlnaGxpZ2h0ZWRSZWZzLmxlbmd0aCA9PSAwIHx8IGhpZ2hsaWdodCkgXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBEcmF3TW9kdWxlKGlzVmlld0Zyb250LCBsYXllciwgc2NhbGVmYWN0b3IsIHBhcnQsIGhpZ2hsaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3Q2FudmFzKGNhbnZhc2RpY3QpXHJcbntcclxuICAgIHJlbmRlcl9jYW52YXMuUmVkcmF3Q2FudmFzKGNhbnZhc2RpY3QpO1xyXG4gICAgbGV0IGlzVmlld0Zyb250ID0gKGNhbnZhc2RpY3QubGF5ZXIgPT09IFwiRlwiKTtcclxuICAgIERyYXdQQ0JFZGdlcyAgKGlzVmlld0Zyb250LCBjYW52YXNkaWN0LnRyYW5zZm9ybS5zKTtcclxuICAgIERyYXdNb2R1bGVzICAgKGlzVmlld0Zyb250LCBjYW52YXNkaWN0LmxheWVyLCBjYW52YXNkaWN0LnRyYW5zZm9ybS5zLCBbXSk7XHJcbiAgICBEcmF3VHJhY2VzICAgIChpc1ZpZXdGcm9udCwgY2FudmFzZGljdC50cmFuc2Zvcm0ucyk7XHJcbiAgICAvLyBEcmF3IGxhc3Qgc28gdGhhdCB0ZXh0IGlzIG5vdCBlcmFzZWQgd2hlbiBkcmF3aW5nIHBvbHlnb25zLlxyXG4gICAgRHJhd1NpbGtzY3JlZW4oaXNWaWV3RnJvbnQsIGNhbnZhc2RpY3QudHJhbnNmb3JtLnMpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBSb3RhdGVWZWN0b3IodiwgYW5nbGUpXHJcbntcclxuICAgIHJldHVybiByZW5kZXJfY2FudmFzLnJvdGF0ZVZlY3Rvcih2LCBhbmdsZSk7XHJcbn1cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gaW5pdFJlbmRlcigpXHJcbntcclxuICAgIGxldCBhbGxjYW52YXMgPSB7XHJcbiAgICAgICAgZnJvbnQ6IHtcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiB7XHJcbiAgICAgICAgICAgICAgICB4OiAwLFxyXG4gICAgICAgICAgICAgICAgeTogMCxcclxuICAgICAgICAgICAgICAgIHM6IDEsXHJcbiAgICAgICAgICAgICAgICBwYW54OiAwLFxyXG4gICAgICAgICAgICAgICAgcGFueTogMCxcclxuICAgICAgICAgICAgICAgIHpvb206IDEsXHJcbiAgICAgICAgICAgICAgICBtb3VzZXN0YXJ0eDogMCxcclxuICAgICAgICAgICAgICAgIG1vdXNlc3RhcnR5OiAwLFxyXG4gICAgICAgICAgICAgICAgbW91c2Vkb3duOiBmYWxzZSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgbGF5ZXI6IFwiRlwiLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYmFjazoge1xyXG4gICAgICAgICAgICB0cmFuc2Zvcm06IHtcclxuICAgICAgICAgICAgICAgIHg6IDAsXHJcbiAgICAgICAgICAgICAgICB5OiAwLFxyXG4gICAgICAgICAgICAgICAgczogMSxcclxuICAgICAgICAgICAgICAgIHBhbng6IDAsXHJcbiAgICAgICAgICAgICAgICBwYW55OiAwLFxyXG4gICAgICAgICAgICAgICAgem9vbTogMSxcclxuICAgICAgICAgICAgICAgIG1vdXNlc3RhcnR4OiAwLFxyXG4gICAgICAgICAgICAgICAgbW91c2VzdGFydHk6IDAsXHJcbiAgICAgICAgICAgICAgICBtb3VzZWRvd246IGZhbHNlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBsYXllcjogXCJCXCIsXHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuICAgIC8vIFNldHMgdGhlIGRhdGEgc3RydWN1cmUgdG8gYSBkZWZhdWx0IHZhbHVlLiBcclxuICAgIGdsb2JhbERhdGEuU2V0QWxsQ2FudmFzKGFsbGNhbnZhcyk7XHJcbiAgICAvLyBTZXQgdGhlIHNjYWxlIHNvIHRoZSBQQ0Igd2lsbCBiZSBzY2FsZWQgYW5kIGNlbnRlcmVkIGNvcnJlY3RseS5cclxuICAgIHJlbmRlcl9jYW52YXMuUmVzaXplQ2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xyXG4gICAgcmVuZGVyX2NhbnZhcy5SZXNpemVDYW52YXMoZ2xvYmFsRGF0YS5HZXRBbGxDYW52YXMoKS5iYWNrKTtcclxuICAgIFxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3SGlnaGxpZ2h0c09uTGF5ZXIoY2FudmFzZGljdCkgXHJcbntcclxuICAgIGxldCBpc1ZpZXdGcm9udCA9IChjYW52YXNkaWN0LmxheWVyID09PSBcIkZcIik7XHJcbiAgICByZW5kZXJfY2FudmFzLkNsZWFySGlnaGxpZ2h0cyhjYW52YXNkaWN0KTtcclxuICAgIERyYXdNb2R1bGVzICAgKGlzVmlld0Zyb250LCBjYW52YXNkaWN0LmxheWVyLCBjYW52YXNkaWN0LnRyYW5zZm9ybS5zLCBnbG9iYWxEYXRhLmdldEhpZ2hsaWdodGVkUmVmcygpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0hpZ2hsaWdodHMocGFzc2VkKSBcclxue1xyXG4gICAgaXNQbGFjZWQ9cGFzc2VkO1xyXG4gICAgZHJhd0hpZ2hsaWdodHNPbkxheWVyKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xyXG4gICAgZHJhd0hpZ2hsaWdodHNPbkxheWVyKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjayk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc2l6ZUFsbCgpIFxyXG57XHJcbiAgICByZW5kZXJfY2FudmFzLlJlc2l6ZUNhbnZhcyhnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmZyb250KTtcclxuICAgIHJlbmRlcl9jYW52YXMuUmVzaXplQ2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuYmFjayk7XHJcbiAgICBkcmF3Q2FudmFzKGdsb2JhbERhdGEuR2V0QWxsQ2FudmFzKCkuZnJvbnQpO1xyXG4gICAgZHJhd0NhbnZhcyhnbG9iYWxEYXRhLkdldEFsbENhbnZhcygpLmJhY2spO1xyXG59XHJcblxyXG5mdW5jdGlvbiBTZXRCb2FyZFJvdGF0aW9uKHZhbHVlKSBcclxue1xyXG4gICAgLypcclxuICAgICAgICBUaGUgYm9hcmQgd2hlbiBkcmF3biBieSBkZWZhdWx0IGlzIHNob3cgcm90YXRlZCAtMTgwIGRlZ3JlZXMuIFxyXG4gICAgICAgIFRoZSBmb2xsb3dpbmcgd2lsbCBhZGQgMTgwIGRlZ3JlZXMgdG8gd2hhdCB0aGUgdXNlciBjYWxjdWxhdGVzIHNvIHRoYXQgdGhlIFBDQlxyXG4gICAgICAgIHdpbGwgYmUgZHJhd24gaW4gdGhlIGNvcnJlY3Qgb3JpZW50YXRpb24sIGkuZS4gZGlzcGxheWVkIGFzIHNob3duIGluIEVDQUQgcHJvZ3JhbS4gXHJcbiAgICAgICAgSW50ZXJuYWxseSB0aGUgcmFuZ2Ugb2YgZGVncmVlcyBpcyBzdG9yZWQgYXMgMCAtPiAzNjBcclxuICAgICovXHJcbiAgICBnbG9iYWxEYXRhLlNldEJvYXJkUm90YXRpb24oKHZhbHVlICogNSkrMTgwKTtcclxuICAgIGdsb2JhbERhdGEud3JpdGVTdG9yYWdlKFwiYm9hcmRSb3RhdGlvblwiLCBnbG9iYWxEYXRhLkdldEJvYXJkUm90YXRpb24oKSk7XHJcbiAgICAvKlxyXG4gICAgICAgIERpc3BsYXkgdGhlIGNvcnJlY3QgcmFuZ2Ugb2YgZGVncmVlcyB3aGljaCBpcyAtMTgwIC0+IDE4MC4gXHJcbiAgICAgICAgVGhlIGZvbGxvd2luZyBqdXN0IHJlbWFwcyAzNjAgZGVncmVlcyB0byBiZSBpbiB0aGUgcmFuZ2UgLTE4MCAtPiAxODAuXHJcbiAgICAqL1xyXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3RhdGlvbkRlZ3JlZVwiKS50ZXh0Q29udGVudCA9IChnbG9iYWxEYXRhLkdldEJvYXJkUm90YXRpb24oKS0xODApO1xyXG4gICAgcmVzaXplQWxsKCk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgaW5pdFJlbmRlciwgcmVzaXplQWxsLCBkcmF3Q2FudmFzLCBkcmF3SGlnaGxpZ2h0cywgUm90YXRlVmVjdG9yLCBTZXRCb2FyZFJvdGF0aW9uXHJcbn07IiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbi8qKlxyXG4gKiBcclxuICogQHBhcmFtIHsqfSB4IFxyXG4gKiBAcGFyYW0geyp9IHkgXHJcbiAqL1xyXG5mdW5jdGlvbiBQb2ludCh4LHkpXHJcbntcclxuICAgIHRoaXMueCA9IHg7XHJcbiAgICB0aGlzLnkgPSB5O1xyXG59XHJcblxyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgUG9pbnRcclxufTtcclxuIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbnZhciByZW5kZXJfbG93bGV2ZWwgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xyXG52YXIgUG9pbnQgICAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL3BvaW50LmpzXCIpLlBvaW50O1xyXG5cclxuLy8gTGluZSB3aWR0aCBpcyBub3QgaW5jbHVkZWQgYXMgcGFydCBvZiB0aGUgdHJhY2UgYXMgaXQgd2lsbCBkZXBlbmQgb24gdGhlIGN1cnJlbnQgZ3VpIHNjYWxlIGZhY3Rvci5cclxuZnVuY3Rpb24gQXJjKGd1aUNvbnRleHQsIHRyYWNlLCBsaW5lV2lkdGgsIGNvbG9yKVxyXG57XHJcblxyXG4gICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KHRyYWNlLmN4MCwgdHJhY2UuY3kwKTtcclxuXHJcblxyXG4gICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7IFxyXG4gICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICBmaWxsOiBmYWxzZSxcclxuICAgICAgICBsaW5lV2lkdGg6IGxpbmVXaWR0aCxcclxuICAgICAgICBsaW5lQ2FwOiBcInJvdW5kXCIgXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5BcmMoIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsXHJcbiAgICAgICAgdHJhY2UucmFkaXVzLFxyXG4gICAgICAgIHRyYWNlLmFuZ2xlMCxcclxuICAgICAgICB0cmFjZS5hbmdsZTEsXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTtcclxufVxyXG5cclxuZnVuY3Rpb24gTGluZShndWlDb250ZXh0LCB0cmFjZSwgbGluZVdpZHRoLCBjb2xvcilcclxue1xyXG4gICAgbGV0IHN0YXJ0UG9pbnQgPSBuZXcgUG9pbnQodHJhY2UueDAsIHRyYWNlLnkwKTtcclxuICAgIGxldCBlbmRQb2ludCAgID0gbmV3IFBvaW50KHRyYWNlLngxLCB0cmFjZS55MSk7XHJcblxyXG4gICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7IFxyXG4gICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICBmaWxsOiBmYWxzZSxcclxuICAgICAgICBsaW5lV2lkdGg6IGxpbmVXaWR0aCxcclxuICAgICAgICBsaW5lQ2FwOiBcInJvdW5kXCIgXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5MaW5lKCBcclxuICAgICAgICBndWlDb250ZXh0LFxyXG4gICAgICAgIHN0YXJ0UG9pbnQsXHJcbiAgICAgICAgZW5kUG9pbnQsXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgICBBcmMsIExpbmVcclxufTtcclxuIiwiXCJ1c2Ugc3RyaWN0XCI7XHJcbnZhciByZW5kZXJfbG93bGV2ZWwgICAgID0gcmVxdWlyZShcIi4vcmVuZGVyX2xvd2xldmVsLmpzXCIpO1xyXG52YXIgUG9pbnQgICAgICAgICAgICAgICA9IHJlcXVpcmUoXCIuL3BvaW50LmpzXCIpLlBvaW50O1xyXG5cclxuLy8gTGluZSB3aWR0aCBpcyBub3QgaW5jbHVkZWQgYXMgcGFydCBvZiB0aGUgdHJhY2UgYXMgaXQgd2lsbCBkZXBlbmQgb24gdGhlIGN1cnJlbnQgZ3VpIHNjYWxlIGZhY3Rvci5cclxuZnVuY3Rpb24gUmVjdGFuZ2xlKGd1aUNvbnRleHQsIGJvdW5kaW5nQm94LCBjb2xvcilcclxue1xyXG4gICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KDAsIDApO1xyXG4gICAgLypcclxuICAgICAgICAgICAgVGhlIGZvbGxvd2luZyBkZXJpdmUgdGhlIGNvcm5lciBwb2ludHMgZm9yIHRoZVxyXG4gICAgICAgICAgICByZWN0YW5ndWxhciBwYWQuIFRoZXNlIGFyZSBjYWxjdWxhdGVkIHVzaW5nIHRoZSBjZW50ZXIgXHJcbiAgICAgICAgICAgIHBvaW50IG9mIHRoZSByZWN0YW5nbGUgYWxvbmcgd2l0aCB0aGUgd2lkdGggYW5kIGhlaWdodCBcclxuICAgICAgICAgICAgb2YgdGhlIHJlY3RhbmdsZS4gXHJcbiAgICAqL1xyXG4gICAgLy8gVG9wIGxlZnQgcG9pbnRcclxuICAgIGxldCBwb2ludDAgPSBuZXcgUG9pbnQoYm91bmRpbmdCb3gueDAsIGJvdW5kaW5nQm94LnkwKTtcclxuICAgIC8vIFRvcCByaWdodCBwb2ludFxyXG4gICAgbGV0IHBvaW50MSA9IG5ldyBQb2ludChib3VuZGluZ0JveC54MSwgYm91bmRpbmdCb3gueTApO1xyXG4gICAgLy8gQm90dG9tIHJpZ2h0IHBvaW50XHJcbiAgICBsZXQgcG9pbnQyID0gbmV3IFBvaW50KGJvdW5kaW5nQm94LngxLCBib3VuZGluZ0JveC55MSk7XHJcbiAgICAvLyBCb3R0b20gbGVmdCBwb2ludFxyXG4gICAgbGV0IHBvaW50MyA9IG5ldyBQb2ludChib3VuZGluZ0JveC54MCwgYm91bmRpbmdCb3gueTEpO1xyXG5cclxuICAgIC8vIEZpcnN0IGZpbGwgdGhlIGJveC4gXHJcbiAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHtcclxuICAgICAgICBjb2xvcjogY29sb3IsXHJcbiAgICAgICAgZmlsbDogdHJ1ZSxcclxuICAgICAgICBnbG9iYWxBbHBoYTogMC4yXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5SZWd1bGFyUG9seWdvbiggXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICBjZW50ZXJQb2ludCwgXHJcbiAgICAgICAgW3BvaW50MCwgcG9pbnQxLCBwb2ludDIsIHBvaW50M10sXHJcbiAgICAgICAgMCxcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApO1xyXG5cclxuICAgIC8vIE5vdyBzdG9rZSB0aGUgYm94XHJcbiAgICByZW5kZXJPcHRpb25zID0ge1xyXG4gICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICBmaWxsOiBmYWxzZSxcclxuICAgICAgICBnbG9iYWxBbHBoYTogMSwgXHJcbiAgICAgICAgbGluZVdpZHRoOiAwLjMzXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5SZWd1bGFyUG9seWdvbiggXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICBjZW50ZXJQb2ludCwgXHJcbiAgICAgICAgW3BvaW50MCwgcG9pbnQxLCBwb2ludDIsIHBvaW50M10sXHJcbiAgICAgICAgMCxcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIFJlY3RhbmdsZVxyXG59O1xyXG4iLCJcInVzZSBzdHJpY3RcIjtcclxudmFyIHBjYiAgICAgICAgPSByZXF1aXJlKFwiLi4vcGNiLmpzXCIpO1xyXG52YXIgZ2xvYmFsRGF0YSA9IHJlcXVpcmUoXCIuLi9nbG9iYWwuanNcIik7XHJcblxyXG5cclxuZnVuY3Rpb24gcHJlcGFyZUNhbnZhcyhjYW52YXMsIGZsaXAsIHRyYW5zZm9ybSkgXHJcbntcclxuICAgIGxldCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xyXG4gICAgY3R4LnNldFRyYW5zZm9ybSgxLCAwLCAwLCAxLCAwLCAwKTtcclxuICAgIGN0eC5zY2FsZSh0cmFuc2Zvcm0uem9vbSwgdHJhbnNmb3JtLnpvb20pO1xyXG4gICAgY3R4LnRyYW5zbGF0ZSh0cmFuc2Zvcm0ucGFueCwgdHJhbnNmb3JtLnBhbnkpO1xyXG4gICAgaWYgKGZsaXApIFxyXG4gICAge1xyXG4gICAgICAgIGN0eC5zY2FsZSgtMSwgMSk7XHJcbiAgICB9XHJcbiAgICBjdHgudHJhbnNsYXRlKHRyYW5zZm9ybS54LCB0cmFuc2Zvcm0ueSk7XHJcbiAgICBjdHgucm90YXRlKGdsb2JhbERhdGEuR2V0Qm9hcmRSb3RhdGlvbigpKk1hdGguUEkvMTgwKTtcclxuICAgIGN0eC5zY2FsZSh0cmFuc2Zvcm0ucywgdHJhbnNmb3JtLnMpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByb3RhdGVWZWN0b3IodiwgYW5nbGUpIFxyXG57XHJcbiAgICBhbmdsZSA9IGFuZ2xlKk1hdGguUEkvMTgwO1xyXG4gICAgcmV0dXJuIFtcclxuICAgICAgICB2WzBdICogTWF0aC5jb3MoYW5nbGUpIC0gdlsxXSAqIE1hdGguc2luKGFuZ2xlKSxcclxuICAgICAgICB2WzBdICogTWF0aC5zaW4oYW5nbGUpICsgdlsxXSAqIE1hdGguY29zKGFuZ2xlKVxyXG4gICAgXTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVjYWxjTGF5ZXJTY2FsZShjYW52YXNkaWN0LCBjYW52YXMpIFxyXG57XHJcbiAgICBsZXQgbGF5ZXJJRCA9IChjYW52YXNkaWN0LmxheWVyID09PSBcIkZcIikgPyBcImZyb250Y2FudmFzXCIgOiBcImJhY2tjYW52YXNcIiA7XHJcbiAgICBsZXQgd2lkdGggICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGxheWVySUQpLmNsaWVudFdpZHRoICogMjtcclxuICAgIGxldCBoZWlnaHQgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQobGF5ZXJJRCkuY2xpZW50SGVpZ2h0ICogMjtcclxuICAgIGxldCBiYm94ICAgID0gYXBwbHlSb3RhdGlvbihwY2JkYXRhLmJvYXJkLnBjYl9zaGFwZS5ib3VuZGluZ19ib3gpO1xyXG4gICAgbGV0IHNjYWxlZmFjdG9yID0gMC45OCAqIE1hdGgubWluKCB3aWR0aCAvIChiYm94Lm1heHggLSBiYm94Lm1pbngpLCBoZWlnaHQgLyAoYmJveC5tYXh5IC0gYmJveC5taW55KSk7XHJcblxyXG4gICAgaWYgKHNjYWxlZmFjdG9yIDwgMC4xKVxyXG4gICAge1xyXG4gICAgICAgIC8vc2NhbGVmYWN0b3IgPSAxO1xyXG4gICAgfVxyXG5cclxuICAgIGNhbnZhc2RpY3QudHJhbnNmb3JtLnMgPSBzY2FsZWZhY3RvcjtcclxuXHJcbiAgICBpZiAoKGNhbnZhc2RpY3QubGF5ZXIgIT0gXCJCXCIpKVxyXG4gICAge1xyXG4gICAgICAgIGNhbnZhc2RpY3QudHJhbnNmb3JtLnggPSAtKChiYm94Lm1heHggKyBiYm94Lm1pbngpICogc2NhbGVmYWN0b3IgKyB3aWR0aCkgKiAwLjU7XHJcbiAgICB9XHJcbiAgICBlbHNlXHJcbiAgICB7XHJcbiAgICAgICAgY2FudmFzZGljdC50cmFuc2Zvcm0ueCA9IC0oKGJib3gubWF4eCArIGJib3gubWlueCkgKiBzY2FsZWZhY3RvciAtIHdpZHRoKSAqIDAuNTtcclxuICAgIH1cclxuICAgIGNhbnZhc2RpY3QudHJhbnNmb3JtLnkgPSAtKChiYm94Lm1heHkgKyBiYm94Lm1pbnkpICogc2NhbGVmYWN0b3IgLSBoZWlnaHQpICogMC41O1xyXG5cclxuICAgIGlmKGNhbnZhc2RpY3QubGF5ZXIgPT09XCJGXCIpXHJcbiAgICB7XHJcbiAgICAgICAgY2FudmFzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICBjYW52YXMuc3R5bGUud2lkdGggPSAod2lkdGggLyAyKSArIFwicHhcIjtcclxuICAgICAgICBjYW52YXMuc3R5bGUuaGVpZ2h0ID0gKGhlaWdodCAvIDIpICsgXCJweFwiO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIGNhbnZhcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIGNhbnZhcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgY2FudmFzLnN0eWxlLndpZHRoID0gKHdpZHRoIC8gMikgKyBcInB4XCI7XHJcbiAgICAgICAgY2FudmFzLnN0eWxlLmhlaWdodCA9IChoZWlnaHQgLyAyKSArIFwicHhcIjtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYXBwbHlSb3RhdGlvbihiYm94KSBcclxue1xyXG4gICAgbGV0IGNvcm5lcnMgPSBbXHJcbiAgICAgICAgW2Jib3gubWlueCwgYmJveC5taW55XSxcclxuICAgICAgICBbYmJveC5taW54LCBiYm94Lm1heHldLFxyXG4gICAgICAgIFtiYm94Lm1heHgsIGJib3gubWlueV0sXHJcbiAgICAgICAgW2Jib3gubWF4eCwgYmJveC5tYXh5XSxcclxuICAgIF07XHJcbiAgICBjb3JuZXJzID0gY29ybmVycy5tYXAoKHYpID0+IHJvdGF0ZVZlY3Rvcih2LCBnbG9iYWxEYXRhLkdldEJvYXJkUm90YXRpb24oKSkpO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBtaW54OiBjb3JuZXJzLnJlZHVjZSgoYSwgdikgPT4gTWF0aC5taW4oYSwgdlswXSksIEluZmluaXR5KSxcclxuICAgICAgICBtaW55OiBjb3JuZXJzLnJlZHVjZSgoYSwgdikgPT4gTWF0aC5taW4oYSwgdlsxXSksIEluZmluaXR5KSxcclxuICAgICAgICBtYXh4OiBjb3JuZXJzLnJlZHVjZSgoYSwgdikgPT4gTWF0aC5tYXgoYSwgdlswXSksIC1JbmZpbml0eSksXHJcbiAgICAgICAgbWF4eTogY29ybmVycy5yZWR1Y2UoKGEsIHYpID0+IE1hdGgubWF4KGEsIHZbMV0pLCAtSW5maW5pdHkpLFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIENsZWFySGlnaGxpZ2h0cyhjYW52YXNkaWN0KVxyXG57XHJcbiAgICBsZXQgY2FudmFzID0gcGNiLkdldExheWVyQ2FudmFzKFwiaGlnaGxpZ2h0c1wiLCAoY2FudmFzZGljdC5sYXllciA9PT0gXCJGXCIpKTtcclxuICAgIENsZWFyQ2FudmFzKGNhbnZhcyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIENsZWFyQ2FudmFzKGNhbnZhcykgXHJcbntcclxuICAgIGxldCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xyXG4gICAgY3R4LnNhdmUoKTtcclxuICAgIGN0eC5zZXRUcmFuc2Zvcm0oMSwgMCwgMCwgMSwgMCwgMCk7XHJcbiAgICBjdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICBjdHgucmVzdG9yZSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwcmVwYXJlTGF5ZXIoY2FudmFzZGljdCwgY2FudmFzKVxyXG57XHJcbiAgICBsZXQgZmxpcCA9IChjYW52YXNkaWN0LmxheWVyICE9IFwiQlwiKTtcclxuXHJcbiAgICBpZihjYW52YXNkaWN0LmxheWVyID09PSBcIkZcIilcclxuICAgIHtcclxuICAgICAgICBwcmVwYXJlQ2FudmFzKGNhbnZhcywgZmxpcCwgY2FudmFzZGljdC50cmFuc2Zvcm0pO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIHByZXBhcmVDYW52YXMoY2FudmFzLCBmbGlwLCBjYW52YXNkaWN0LnRyYW5zZm9ybSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIFJlZHJhd0NhbnZhcyhsYXllcmRpY3QpXHJcbntcclxuICAgIGxldCBwY2JMYXllcnMgPSBwY2IuR2V0TGF5ZXJzKCk7XHJcblxyXG4gICAgaWYobGF5ZXJkaWN0LmxheWVyID09PSBcIkZcIilcclxuICAgIHtcclxuICAgICAgICBsZXQgY2FudmFzID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGNiTGF5ZXJzLmxlbmd0aDsgaSsrKSBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHBjYkxheWVyc1tpXS5mcm9udF9pZCk7XHJcbiAgICAgICAgICAgIHByZXBhcmVMYXllcihsYXllcmRpY3QsIGNhbnZhcyk7XHJcbiAgICAgICAgICAgIENsZWFyQ2FudmFzKGNhbnZhcyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIGxldCBjYW52YXMgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwY2JMYXllcnMubGVuZ3RoOyBpKyspIFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQocGNiTGF5ZXJzW2ldLmJhY2tfaWQpO1xyXG4gICAgICAgICAgICBwcmVwYXJlTGF5ZXIobGF5ZXJkaWN0LCBjYW52YXMpO1xyXG4gICAgICAgICAgICBDbGVhckNhbnZhcyhjYW52YXMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gUmVzaXplQ2FudmFzKGxheWVyZGljdClcclxue1xyXG4gICAgbGV0IGZsaXAgPSAobGF5ZXJkaWN0LmxheWVyICE9IFwiQlwiKTtcclxuICAgIGxldCBwY2JMYXllcnMgPSBwY2IuR2V0TGF5ZXJzKCk7XHJcbiAgICBcclxuICAgIGlmKGxheWVyZGljdC5sYXllciA9PT0gXCJGXCIpXHJcbiAgICB7XHJcbiAgICAgICAgbGV0IGNhbnZhcyA9IHVuZGVmaW5lZDtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBjYkxheWVycy5sZW5ndGg7IGkrKykgXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChwY2JMYXllcnNbaV0uZnJvbnRfaWQpO1xyXG4gICAgICAgICAgICByZWNhbGNMYXllclNjYWxlKGxheWVyZGljdCwgY2FudmFzKTtcclxuICAgICAgICAgICAgcHJlcGFyZUNhbnZhcyhjYW52YXMsIGZsaXAsIGxheWVyZGljdC50cmFuc2Zvcm0pO1xyXG4gICAgICAgICAgICBDbGVhckNhbnZhcyhjYW52YXMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBsZXQgY2FudmFzID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGNiTGF5ZXJzLmxlbmd0aDsgaSsrKSBcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHBjYkxheWVyc1tpXS5iYWNrX2lkKTtcclxuICAgICAgICAgICAgcmVjYWxjTGF5ZXJTY2FsZShsYXllcmRpY3QsIGNhbnZhcyk7XHJcbiAgICAgICAgICAgIHByZXBhcmVDYW52YXMoY2FudmFzLCBmbGlwLCBsYXllcmRpY3QudHJhbnNmb3JtKTtcclxuICAgICAgICAgICAgQ2xlYXJDYW52YXMoY2FudmFzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIFJlc2l6ZUNhbnZhcywgUmVkcmF3Q2FudmFzLCByb3RhdGVWZWN0b3IsIENsZWFySGlnaGxpZ2h0c1xyXG59O1xyXG5cclxuXHJcbiIsIlwidXNlIHN0cmljdFwiO1xyXG5cclxudmFyIFBvaW50ID0gcmVxdWlyZShcIi4vcG9pbnQuanNcIikuUG9pbnQ7XHJcblxyXG5mdW5jdGlvbiBBcmMoZ3VpQ29udGV4dCwgY2VudGVyUG9pbnQsIHJhZGl1cywgYW5nbGVTdGFydCwgYW5nbGVFbmQsIHJlbmRlck9wdGlvbnMgKVxyXG57XHJcbiAgICBndWlDb250ZXh0LnNhdmUoKTtcclxuXHJcbiAgICBpZiggcmVuZGVyT3B0aW9ucy5jb2xvcilcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LmZpbGxTdHlsZSAgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjtcclxuICAgICAgICBndWlDb250ZXh0LnN0cm9rZVN0eWxlID0gIHJlbmRlck9wdGlvbnMuY29sb3I7ICAgICAgICBcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBvdmVyd3JpdGluZyBsaW5lIHdpZHRoLCB0aGVuIHVwZGF0ZSB0aGF0IGhlcmVcclxuICAgIGlmKHJlbmRlck9wdGlvbnMubGluZVdpZHRoKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQubGluZVdpZHRoID0gcmVuZGVyT3B0aW9ucy5saW5lV2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgaWYocmVuZGVyT3B0aW9ucy5saW5lQ2FwKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQubGluZUNhcCA9IHJlbmRlck9wdGlvbnMubGluZUNhcDtcclxuICAgIH1cclxuXHJcblxyXG4gICAgLy8gaHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS90YWdzL2NhbnZhc19hcmMuYXNwXHJcbiAgICBndWlDb250ZXh0LmJlZ2luUGF0aCgpO1xyXG4gICAgZ3VpQ29udGV4dC5hcmMoIGNlbnRlclBvaW50LngsIGNlbnRlclBvaW50LnksIHJhZGl1cywgYW5nbGVTdGFydCpNYXRoLlBJLzE4MCwgYW5nbGVFbmQqTWF0aC5QSS8xODApO1xyXG5cclxuICAgIC8vIElmIGZpbGwgaXMgdHJ1ZSwgZmlsbCB0aGUgYm94LCBvdGhlcndpc2UganVzdCBtYWtlIGFuIG91dGxpbmVcclxuICAgIGlmKHJlbmRlck9wdGlvbnMuZmlsbClcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LmZpbGwoKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LnN0cm9rZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGd1aUNvbnRleHQucmVzdG9yZSgpO1xyXG5cclxufVxyXG5cclxuZnVuY3Rpb24gTGluZShndWlDb250ZXh0LCBzdGFydFBvaW50LCBlbmRQb2ludCwgcmVuZGVyT3B0aW9ucyApXHJcbntcclxuICAgIGd1aUNvbnRleHQuc2F2ZSgpO1xyXG5cclxuICAgIGlmKCByZW5kZXJPcHRpb25zLmNvbG9yKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQuZmlsbFN0eWxlICAgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjtcclxuICAgICAgICBndWlDb250ZXh0LnN0cm9rZVN0eWxlID0gIHJlbmRlck9wdGlvbnMuY29sb3I7ICAgICAgICBcclxuICAgIH1cclxuXHJcbiAgICAvLyBJZiBvdmVyd3JpdGluZyBsaW5lIHdpZHRoLCB0aGVuIHVwZGF0ZSB0aGF0IGhlcmVcclxuICAgIGlmKHJlbmRlck9wdGlvbnMubGluZVdpZHRoKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQubGluZVdpZHRoID0gcmVuZGVyT3B0aW9ucy5saW5lV2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgaWYocmVuZGVyT3B0aW9ucy5saW5lQ2FwKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQubGluZUNhcCA9IHJlbmRlck9wdGlvbnMubGluZUNhcDtcclxuICAgIH1cclxuXHJcbiAgICBndWlDb250ZXh0LmJlZ2luUGF0aCgpO1xyXG4gICAgZ3VpQ29udGV4dC5tb3ZlVG8oc3RhcnRQb2ludC54LCBzdGFydFBvaW50LnkpO1xyXG4gICAgZ3VpQ29udGV4dC5saW5lVG8oZW5kUG9pbnQueCwgZW5kUG9pbnQueSk7XHJcblxyXG4gICAgLy8gSWYgZmlsbCBpcyB0cnVlLCBmaWxsIHRoZSBib3gsIG90aGVyd2lzZSBqdXN0IG1ha2UgYW4gb3V0bGluZVxyXG4gICAgaWYocmVuZGVyT3B0aW9ucy5maWxsKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQuZmlsbCgpO1xyXG4gICAgfVxyXG4gICAgZWxzZVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQuc3Ryb2tlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZ3VpQ29udGV4dC5yZXN0b3JlKCk7XHJcblxyXG59XHJcblxyXG5mdW5jdGlvbiBSZWd1bGFyUG9seWdvbihndWlDb250ZXh0LCBjZW50ZXJQb2ludCwgdmVydGljZXMsIGFuZ2xlLCByZW5kZXJPcHRpb25zIClcclxue1xyXG5cclxuICAgIGd1aUNvbnRleHQuc2F2ZSgpO1xyXG4gICAgaWYoIHJlbmRlck9wdGlvbnMuY29sb3IpXHJcbiAgICB7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsU3R5bGUgID0gIHJlbmRlck9wdGlvbnMuY29sb3I7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5zdHJva2VTdHlsZSA9ICByZW5kZXJPcHRpb25zLmNvbG9yOyAgICAgICAgXHJcbiAgICB9XHJcbiAgICAvLyBJZiBvdmVyd3JpdGluZyBsaW5lIHdpZHRoLCB0aGVuIHVwZGF0ZSB0aGF0IGhlcmVcclxuICAgIGlmKHJlbmRlck9wdGlvbnMubGluZVdpZHRoKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQubGluZVdpZHRoID0gcmVuZGVyT3B0aW9ucy5saW5lV2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgaWYocmVuZGVyT3B0aW9ucy5nbG9iYWxBbHBoYSlcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0Lmdsb2JhbEFscGhhID0gcmVuZGVyT3B0aW9ucy5nbG9iYWxBbHBoYTtcclxuICAgIH1cclxuXHJcbiAgICBndWlDb250ZXh0LnRyYW5zbGF0ZShjZW50ZXJQb2ludC54LCBjZW50ZXJQb2ludC55KTtcclxuICAgIC8qIFxyXG4gICAgICAgUm90YXRlIG9yaWdpbiBiYXNlZCBvbiBhbmdsZSBnaXZlblxyXG4gICAgICAgTk9URTogY29tcGFyZWQgdG8gb2Jsb25nIHBhZHMsIG5vIGFkZGl0aW9uYWwgbW9kaWZpY2F0aW9uIGlzIHJlcXVpcmVkXHJcbiAgICAgICAgICAgICBvZiBhbmdsZSB0byBnZXQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSBjb3JyZWN0bHkuXHJcbiAgICAqL1xyXG4gICAgZ3VpQ29udGV4dC5yb3RhdGUoYW5nbGUqTWF0aC5QSS8xODApO1xyXG5cclxuICAgIC8qIFxyXG4gICAgICAgUm90YXRlIG9yaWdpbiBiYXNlZCBvbiBhbmdsZSBnaXZlblxyXG4gICAgICAgTk9URTogY29tcGFyZWQgdG8gb2Jsb25nIHBhZHMsIG5vIGFkZGl0aW9uYWwgbW9kaWZpY2F0aW9uIGlzIHJlcXVpcmVkXHJcbiAgICAgICAgICAgICBvZiBhbmdsZSB0byBnZXQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSBjb3JyZWN0bHkuXHJcbiAgICAqL1xyXG4gICAgLy9ndWlDb250ZXh0LnJvdGF0ZSgoYW5nbGUpKk1hdGguUEkvMTgwKTtcclxuXHJcbiAgICBndWlDb250ZXh0LmJlZ2luUGF0aCgpO1xyXG4gICAgZ3VpQ29udGV4dC5tb3ZlVG8odmVydGljZXNbMF0ueCx2ZXJ0aWNlc1swXS55KTtcclxuXHJcbiAgICBmb3IodmFyIGkgPSAxOyBpIDwgdmVydGljZXMubGVuZ3RoOyBpKyspXHJcbiAgICB7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5saW5lVG8odmVydGljZXNbaV0ueCx2ZXJ0aWNlc1tpXS55KTtcclxuICAgIH1cclxuICAgIGd1aUNvbnRleHQuY2xvc2VQYXRoKCk7XHJcbiAgICBcclxuICAgIC8vIElmIGZpbGwgaXMgdHJ1ZSwgZmlsbCB0aGUgYm94LCBvdGhlcndpc2UganVzdCBtYWtlIGFuIG91dGxpbmVcclxuICAgIGlmKHJlbmRlck9wdGlvbnMuZmlsbClcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LmZpbGwoKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LnN0cm9rZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGd1aUNvbnRleHQucmVzdG9yZSgpO1xyXG5cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIElycmVndWxhclBvbHlnb24oZ3VpQ29udGV4dCwgdmVydGljZXMsIHJlbmRlck9wdGlvbnMgKVxyXG57XHJcblxyXG4gICAgZ3VpQ29udGV4dC5zYXZlKCk7XHJcbiAgICBpZiggcmVuZGVyT3B0aW9ucy5jb2xvcilcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LmZpbGxTdHlsZSAgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjtcclxuICAgICAgICBndWlDb250ZXh0LnN0cm9rZVN0eWxlID0gIHJlbmRlck9wdGlvbnMuY29sb3I7ICAgICAgICBcclxuICAgIH1cclxuICAgIC8vIElmIG92ZXJ3cml0aW5nIGxpbmUgd2lkdGgsIHRoZW4gdXBkYXRlIHRoYXQgaGVyZVxyXG4gICAgaWYocmVuZGVyT3B0aW9ucy5saW5lV2lkdGgpXHJcbiAgICB7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5saW5lV2lkdGggPSByZW5kZXJPcHRpb25zLmxpbmVXaWR0aDtcclxuICAgIH1cclxuXHJcbiAgICBpZihyZW5kZXJPcHRpb25zLmdsb2JhbEFscGhhKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQuZ2xvYmFsQWxwaGEgPSByZW5kZXJPcHRpb25zLmdsb2JhbEFscGhhO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKHJlbmRlck9wdGlvbnMuY29tcG9zaXRpb25UeXBlKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQuZ2xvYmFsQ29tcG9zaXRlT3BlcmF0aW9uICA9IHJlbmRlck9wdGlvbnMuY29tcG9zaXRpb25UeXBlO1xyXG4gICAgfVxyXG5cclxuICAgIGd1aUNvbnRleHQuYmVnaW5QYXRoKCk7XHJcbiAgICBndWlDb250ZXh0Lm1vdmVUbyh2ZXJ0aWNlc1swXS54LHZlcnRpY2VzWzBdLnkpO1xyXG5cclxuICAgIGZvcih2YXIgaSA9IDE7IGkgPCB2ZXJ0aWNlcy5sZW5ndGg7IGkrKylcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LmxpbmVUbyh2ZXJ0aWNlc1tpXS54LHZlcnRpY2VzW2ldLnkpO1xyXG4gICAgfVxyXG4gICAgZ3VpQ29udGV4dC5jbG9zZVBhdGgoKTtcclxuXHJcbiAgICAvLyBJZiBmaWxsIGlzIHRydWUsIGZpbGwgdGhlIGJveCwgb3RoZXJ3aXNlIGp1c3QgbWFrZSBhbiBvdXRsaW5lXHJcbiAgICBpZihyZW5kZXJPcHRpb25zLmZpbGwpXHJcbiAgICB7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlXHJcbiAgICB7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5zdHJva2UoKTtcclxuICAgIH1cclxuXHJcbiAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcclxuXHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBDaXJjbGUoZ3VpQ29udGV4dCwgY2VudGVyUG9pbnQsIHJhZGl1cywgcmVuZGVyT3B0aW9ucylcclxue1xyXG4gICAgZ3VpQ29udGV4dC5zYXZlKCk7XHJcbiAgICBcclxuICAgIGlmKCByZW5kZXJPcHRpb25zLmNvbG9yKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQuZmlsbFN0eWxlICA9ICByZW5kZXJPcHRpb25zLmNvbG9yO1xyXG4gICAgICAgIGd1aUNvbnRleHQuc3Ryb2tlU3R5bGUgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjsgICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIGlmKHJlbmRlck9wdGlvbnMubGluZVdpZHRoKVxyXG4gICAge1xyXG4gICAgICAgIGd1aUNvbnRleHQubGluZVdpZHRoID0gcmVuZGVyT3B0aW9ucy5saW5lV2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgLyogRHJhdyB0aGUgZHJpbGwgaG9sZSAqL1xyXG4gICAgZ3VpQ29udGV4dC5iZWdpblBhdGgoKTtcclxuICAgIGd1aUNvbnRleHQuYXJjKGNlbnRlclBvaW50LngsY2VudGVyUG9pbnQueSwgcmFkaXVzLCAwLCAyKk1hdGguUEkpO1xyXG5cclxuICAgIGlmKHJlbmRlck9wdGlvbnMuZmlsbClcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LmZpbGwoKTtcclxuICAgIH1cclxuICAgIGVsc2VcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LnN0cm9rZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGd1aUNvbnRleHQucmVzdG9yZSgpO1xyXG59XHJcblxyXG5cclxuLypcclxuICAgIFRvIHJlbmRlciBhbiBvdmFsIHNvbWUgamF2YXNjcmlwdCB0cmlja2VyeSBpcyB1c2VkLiBUbyBoYWxmIGNpcmNsZXMgYXJlIHJlbmRlcmVkLCBcclxuICAgIGFuZCBzaW5jZSBieSBkZWZhdWx0IHdoZW4gZHJhd2luZyBzaGFwZXMgdGhleSB3aWxsIGJ5IGRlZmF1bHQgYmUgY29ubmVjdGVkIGJ5IGF0IFxyXG4gICAgbGVhc3Qgb25lIHBvaW50IGlmIGNsb3NlIHBhdGggaXMgbm90IGNhbGxlZC4gU28gYnkganVzdCBjYWxsaW5nIHRoZSB0b3AgYW5kIGJvdHRvbSBcclxuICAgIGhhbGYgY2lyY2xlcywgdGhlIHJlY3Rhbmd1bGFyIGNlbnRlciBvZiB0aGUgaGFsZiBjaXJjbGUgd2lsbCBiZSBmaWxsZWQuXHJcbiovXHJcbmZ1bmN0aW9uIE92YWwoZ3VpQ29udGV4dCwgY2VudGVyUG9pbnQsIGhlaWdodCwgd2lkdGgsIGFuZ2xlLCByZW5kZXJPcHRpb25zKVxyXG57XHJcblxyXG4gICAgLy8gQ2VudGVyIHBvaW50IG9mIGJvdGggY2lyY2xlcy5cclxuICAgIGxldCBjZW50ZXJQb2ludDEgPSBuZXcgUG9pbnQoMCwgLWhlaWdodC8yKTtcclxuICAgIGxldCBjZW50ZXJQb2ludDIgPSBuZXcgUG9pbnQoMCwgaGVpZ2h0LzIpO1xyXG4gICAgbGV0IHJhZGl1cyA9IHdpZHRoLzI7XHJcblxyXG4gICAgZ3VpQ29udGV4dC5zYXZlKCk7XHJcbiAgICBpZiggcmVuZGVyT3B0aW9ucy5jb2xvcilcclxuICAgIHtcclxuICAgICAgICBndWlDb250ZXh0LmZpbGxTdHlsZSAgPSAgcmVuZGVyT3B0aW9ucy5jb2xvcjtcclxuICAgICAgICBndWlDb250ZXh0LnN0cm9rZVN0eWxlID0gIHJlbmRlck9wdGlvbnMuY29sb3I7XHJcbiAgICB9XHJcblxyXG4gICAgLypcclxuICAgICAgICBUaGUgZm9sbG93aW5nIG9ubHkgcmVhbGx5IG5lZWRzIHRvIGRyYXcgdHdvIHNlbWljaXJjbGVzIGFzIGludGVybmFsbHkgdGhlIHNlbWljaXJjbGVzIHdpbGwgXHJcbiAgICAgICAgYXR0YWNoIHRvIGVhY2ggb3RoZXIgdG8gY3JlYXRlIHRoZSBjb21wbGV0ZWQgb2JqZWN0LlxyXG4gICAgICovXHJcblxyXG4gICAgZ3VpQ29udGV4dC50cmFuc2xhdGUoY2VudGVyUG9pbnQueCwgY2VudGVyUG9pbnQueSk7XHJcbiAgICAvKiBcclxuICAgICAgIFJvdGF0ZSBvcmlnaW4gYmFzZWQgb24gYW5nbGUgZ2l2ZW5cclxuICAgICAgIE5PVEU6IEZvciBzb21lIHJlYXNvbiBFYWdsZUNBRCBpdGVtcyBhcmUgcm90YXRlZCBieSA5MCBkZWdyZWVzIGJ5IGRlZmF1bHQuIFxyXG4gICAgICAgICAgICAgVGhpcyBjb3JyZWN0cyBmb3IgdGhhdCBzbyBpdGVtcyBhcmUgZGlzcGxheWVkIGNvcnJlY3RseS5cclxuICAgICAgICAgICAgIFRoaXMgc2VlbXMgdG8gYWxzbyBvbmx5IGJlIHJlcXVpcmVkIGZvciBvYmxvbmcgcGFkcy4gVGhpcyBpcyBtb3N0IGxpa2VseSBkdWUgdG8gdGhlIFxyXG4gICAgICAgICAgICAgYXJjIGZ1bmN0aW9ucyB1c2VkLlxyXG4gICAgKi9cclxuICAgIGd1aUNvbnRleHQucm90YXRlKChhbmdsZS05MCkqTWF0aC5QSS8xODApO1xyXG5cclxuICAgIGd1aUNvbnRleHQuYmVnaW5QYXRoKCk7XHJcbiAgICBndWlDb250ZXh0LmFyYyhjZW50ZXJQb2ludDEueCwgY2VudGVyUG9pbnQxLnksIHJhZGl1cywgTWF0aC5QSSwwKTtcclxuICAgIGd1aUNvbnRleHQuYXJjKGNlbnRlclBvaW50Mi54LCBjZW50ZXJQb2ludDIueSwgcmFkaXVzLCAwLCBNYXRoLlBJICk7XHJcbiAgICBndWlDb250ZXh0LmNsb3NlUGF0aCgpO1xyXG4gICAgXHJcbiAgICBpZihyZW5kZXJPcHRpb25zLmZpbGwpXHJcbiAgICB7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5maWxsKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlXHJcbiAgICB7XHJcbiAgICAgICAgZ3VpQ29udGV4dC5zdHJva2UoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSZXN0b3JlcyBjb250ZXh0IHRvIHN0YXRlIHByaW9yIHRvIHRoaXMgcmVuZGVyaW5nIGZ1bmN0aW9uIGJlaW5nIGNhbGxlZC4gXHJcbiAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcclxufVxyXG5cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgQXJjLCBMaW5lLCBSZWd1bGFyUG9seWdvbiwgSXJyZWd1bGFyUG9seWdvbiwgQ2lyY2xlLCBPdmFsXHJcbn07XHJcbiIsIlwidXNlIHN0cmljdFwiO1xyXG52YXIgcmVuZGVyX2xvd2xldmVsICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlcl9sb3dsZXZlbC5qc1wiKTtcclxudmFyIFBvaW50ICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9wb2ludC5qc1wiKS5Qb2ludDtcclxuXHJcbmZ1bmN0aW9uIERyYXdEcmlsbEhvbGUoZ3VpQ29udGV4dCwgeCwgeSwgcmFkaXVzKVxyXG57XHJcblxyXG4gICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KHgsIHkpO1xyXG5cclxuXHJcbiAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHtcclxuICAgICAgICBjb2xvcjogXCIjQ0NDQ0NDXCIsXHJcbiAgICAgICAgZmlsbDogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZShcclxuICAgICAgICBndWlDb250ZXh0LFxyXG4gICAgICAgIGNlbnRlclBvaW50LCAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICByYWRpdXMsIFxyXG4gICAgICAgIHJlbmRlck9wdGlvbnNcclxuICAgICk7ICAgICAgICAgICAgICAgICAgICAgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIFJlY3RhbmdsZShndWlDb250ZXh0LCBwYWQsIGNvbG9yKVxyXG57XHJcbiAgICBsZXQgY2VudGVyUG9pbnQgPSBuZXcgUG9pbnQocGFkLngsIHBhZC55KTtcclxuXHJcbiAgICAvKlxyXG4gICAgICAgICAgICBUaGUgZm9sbG93aW5nIGRlcml2ZSB0aGUgY29ybmVyIHBvaW50cyBmb3IgdGhlXHJcbiAgICAgICAgICAgIHJlY3Rhbmd1bGFyIHBhZC4gVGhlc2UgYXJlIGNhbGN1bGF0ZWQgdXNpbmcgdGhlIGNlbnRlciBcclxuICAgICAgICAgICAgcG9pbnQgb2YgdGhlIHJlY3RhbmdsZSBhbG9uZyB3aXRoIHRoZSB3aWR0aCBhbmQgaGVpZ2h0IFxyXG4gICAgICAgICAgICBvZiB0aGUgcmVjdGFuZ2xlLiBcclxuICAgICovXHJcbiAgICAvLyBUb3AgbGVmdCBwb2ludFxyXG4gICAgbGV0IHBvaW50MCA9IG5ldyBQb2ludCgtcGFkLmR4LzIsIHBhZC5keS8yKTtcclxuICAgIC8vIFRvcCByaWdodCBwb2ludFxyXG4gICAgbGV0IHBvaW50MSA9IG5ldyBQb2ludChwYWQuZHgvMiwgcGFkLmR5LzIpO1xyXG4gICAgLy8gQm90dG9tIHJpZ2h0IHBvaW50XHJcbiAgICBsZXQgcG9pbnQyID0gbmV3IFBvaW50KHBhZC5keC8yLCAtcGFkLmR5LzIpO1xyXG4gICAgLy8gQm90dG9tIGxlZnQgcG9pbnRcclxuICAgIGxldCBwb2ludDMgPSBuZXcgUG9pbnQoLXBhZC5keC8yLCAtcGFkLmR5LzIpO1xyXG5cclxuXHJcbiAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHtcclxuICAgICAgICBjb2xvcjogY29sb3IsXHJcbiAgICAgICAgZmlsbDogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgcmVuZGVyX2xvd2xldmVsLlJlZ3VsYXJQb2x5Z29uKCBcclxuICAgICAgICBndWlDb250ZXh0LFxyXG4gICAgICAgIGNlbnRlclBvaW50LCBcclxuICAgICAgICBbcG9pbnQwLCBwb2ludDEsIHBvaW50MiwgcG9pbnQzXSxcclxuICAgICAgICBwYWQuYW5nbGUsXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTtcclxuXHJcbiAgICBpZihwYWQucGFkX3R5cGUgPT0gXCJ0aHRcIilcclxuICAgIHtcclxuICAgICAgICBEcmF3RHJpbGxIb2xlKGd1aUNvbnRleHQsIHBhZC54LCBwYWQueSwgcGFkLmRyaWxsLzIpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKlxyXG4gICAgQW4gb2Jsb25nIHBhZCBjYW4gYmUgdGhvdWdodCBvZiBhcyBoYXZpbmcgYSByZWN0YW5ndWxhciBtaWRkbGUgd2l0aCB0d28gc2VtaWNpcmNsZSBlbmRzLiBcclxuXHJcbiAgICBFYWdsZUNBRCBwcm92aWRlcyBwcm92aWRlcyB0aHJlZSBwaWVjZXMgb2YgaW5mb3JtYXRpb24gZm9yIGdlbmVyYXRpbmcgdGhlc2UgcGFkcy4gXHJcbiAgICAgICAgMSkgQ2VudGVyIHBvaW50ID0gQ2VudGVyIG9mIHBhcnRcclxuICAgICAgICAyKSBEaWFtZXRlciA9IGRpc3RhbmNlIGZyb20gY2VudGVyIHBvaW50IHRvIGVkZ2Ugb2Ygc2VtaWNpcmNsZVxyXG4gICAgICAgIDMpIEVsb25nYXRpb24gPSUgcmF0aW8gcmVsYXRpbmcgZGlhbWV0ZXIgdG8gd2lkdGhcclxuXHJcbiAgICBUaGUgZGVzaWduIGFsc28gaGFzIDQgcG9pbnRzIG9mICBpbnRlcmVzdCwgZWFjaCByZXByZXNlbnRpbmcgdGhlIFxyXG4gICAgY29ybmVyIG9mIHRoZSByZWN0YW5nbGUuIFxyXG5cclxuICAgIFRvIHJlbmRlciB0aGUgbGVuZ3RoIGFuZCB3aWR0aCBhcmUgZGVyaXZlZC4gVGhpcyBpcyBkaXZpZGVkIGluIGhhbGYgdG8gZ2V0IHRoZSBcclxuICAgIHZhbHVlcyB1c2VkIHRvIHRyYW5zbGF0ZSB0aGUgY2VudHJhbCBwb2ludCB0byBvbmUgb2YgdGhlIHZlcnRpY2llcy4gXHJcbiovXHJcbmZ1bmN0aW9uIE9ibG9uZyhndWlDb250ZXh0LCBwYWQsIGNvbG9yKVxyXG57ICAgIFxyXG4gICAgLy8gRGlhbWV0ZXIgaXMgdGhlIGRpc25jZSBmcm9tIGNlbnRlciBvZiBwYWQgdG8gdGlwIG9mIGNpcmNsZVxyXG4gICAgLy8gZWxvbmdhdGlvbiBpcyBhIGZhY3RvciB0aGF0IHJlbGF0ZWQgdGhlIGRpYW1ldGVyIHRvIHRoZSB3aWR0aFxyXG4gICAgLy8gVGhpcyBpcyB0aGUgdG90YWwgd2lkdGhcclxuICAgIGxldCB3aWR0aCAgID0gcGFkLmRpYW1ldGVyKnBhZC5lbG9uZ2F0aW9uLzEwMDtcclxuICAgIFxyXG4gICAgLy8gVEhlIHdpZHRoIG9mIHRoZSByZWN0YW5nbGUgaXMgdGhlIGRpYW1ldGVyIC1oYWxmIHRoZSByYWRpdXMuXHJcbiAgICAvLyBTZWUgZG9jdW1lbnRhdGlvbiBvbiBob3cgdGhlc2UgYXJlIGNhbGN1bGF0ZWQuXHJcbiAgICBsZXQgaGVpZ2h0ICA9IChwYWQuZGlhbWV0ZXItd2lkdGgvMikqMjtcclxuXHJcbiAgICAvLyBhc3N1bWVzIG92YWwgaXMgY2VudGVyZWQgYXQgKDAsMClcclxuICAgIGxldCBjZW50ZXJQb2ludCA9IG5ldyBQb2ludChwYWQueCwgcGFkLnkpO1xyXG5cclxuICAgIGxldCByZW5kZXJPcHRpb25zID0geyBcclxuICAgICAgICBjb2xvcjogY29sb3IsXHJcbiAgICAgICAgZmlsbDogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgcmVuZGVyX2xvd2xldmVsLk92YWwoIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsXHJcbiAgICAgICAgaGVpZ2h0LFxyXG4gICAgICAgIHdpZHRoLFxyXG4gICAgICAgIHBhZC5hbmdsZSxcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApO1xyXG5cclxuICAgIC8qIE9ubHkgZHJhdyBkcmlsbCBob2xlIGlmIHRodCB0eXBlIHBhZCAqL1xyXG4gICAgaWYocGFkLnBhZF90eXBlID09IFwidGh0XCIpXHJcbiAgICB7XHJcbiAgICAgICAgRHJhd0RyaWxsSG9sZShndWlDb250ZXh0LCBwYWQueCwgcGFkLnksIHBhZC5kcmlsbC8yKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gUm91bmQoZ3VpQ29udGV4dCwgcGFkLCBjb2xvcilcclxue1xyXG4gICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KHBhZC54LCBwYWQueSk7XHJcblxyXG4gICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7XHJcbiAgICAgICAgY29sb3I6IGNvbG9yLFxyXG4gICAgICAgIGZpbGw6IHRydWUsXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5DaXJjbGUoIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHBhZC5kcmlsbCwgXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTsgXHJcblxyXG4gICAgaWYocGFkLnBhZF90eXBlID09IFwidGh0XCIpXHJcbiAgICB7XHJcbiAgICAgICAgRHJhd0RyaWxsSG9sZShndWlDb250ZXh0LCBwYWQueCwgcGFkLnksIHBhZC5kcmlsbC8yKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gT2N0YWdvbihndWlDb250ZXh0LCBwYWQsIGNvbG9yKVxyXG57XHJcbiAgICAvLyBXaWxsIHN0b3JlIHRoZSB2ZXJ0aWNpZXMgb2YgdGhlIHBvbHlnb24uXHJcbiAgICBsZXQgcG9seWdvblZlcnRpY2llcyA9IFtdO1xyXG5cclxuICAgIFxyXG4gICAgbGV0IG4gPSA4O1xyXG4gICAgbGV0IHIgPSBwYWQuZGlhbWV0ZXIvMjtcclxuICAgIC8vIEFzc3VtZXMgYSBwb2x5Z29uIGNlbnRlcmVkIGF0ICgwLDApXHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBuOyBpKyspIFxyXG4gICAge1xyXG4gICAgICAgIHBvbHlnb25WZXJ0aWNpZXMucHVzaChuZXcgUG9pbnQociAqIE1hdGguY29zKDIgKiBNYXRoLlBJICogaSAvIG4pLCByICogTWF0aC5zaW4oMiAqIE1hdGguUEkgKiBpIC8gbikpKTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYW5nbGUgPSAocGFkLmFuZ2xlKzQ1LzIpO1xyXG4gICAgbGV0IGNlbnRlclBvaW50ID0gbmV3IFBvaW50KHBhZC54LCBwYWQueSk7XHJcblxyXG4gICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7IFxyXG4gICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICBmaWxsOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICByZW5kZXJfbG93bGV2ZWwuUmVndWxhclBvbHlnb24oIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsIFxyXG4gICAgICAgIHBvbHlnb25WZXJ0aWNpZXMsXHJcbiAgICAgICAgYW5nbGUsXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTtcclxuXHJcbiAgICAvKiBPbmx5IGRyYXcgZHJpbGwgaG9sZSBpZiB0aHQgdHlwZSBwYWQgKi9cclxuICAgIGlmKHBhZC5wYWRfdHlwZSA9PSBcInRodFwiKVxyXG4gICAge1xyXG4gICAgICAgIERyYXdEcmlsbEhvbGUoZ3VpQ29udGV4dCwgcGFkLngsIHBhZC55LCBwYWQuZHJpbGwvMik7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gICAgUmVjdGFuZ2xlLCBPYmxvbmcsIFJvdW5kLCBPY3RhZ29uXHJcbn07XHJcbiIsIlwidXNlIHN0cmljdFwiO1xyXG52YXIgcmVuZGVyX2xvd2xldmVsICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlcl9sb3dsZXZlbC5qc1wiKTtcclxudmFyIFBvaW50ICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9wb2ludC5qc1wiKS5Qb2ludDtcclxuXHJcbi8vIExpbmUgd2lkdGggaXMgbm90IGluY2x1ZGVkIGFzIHBhcnQgb2YgdGhlIHRyYWNlIGFzIGl0IHdpbGwgZGVwZW5kIG9uIHRoZSBjdXJyZW50IGd1aSBzY2FsZSBmYWN0b3IuXHJcbmZ1bmN0aW9uIEFyYyhndWlDb250ZXh0LCB0cmFjZSwgbGluZVdpZHRoLCBjb2xvcilcclxue1xyXG5cclxuICAgIGxldCBjZW50ZXJQb2ludCA9IG5ldyBQb2ludCh0cmFjZS5jeDAsIHRyYWNlLmN5MCk7XHJcblxyXG5cclxuICAgIGxldCByZW5kZXJPcHRpb25zID0geyBcclxuICAgICAgICBjb2xvcjogY29sb3IsXHJcbiAgICAgICAgZmlsbDogZmFsc2UsXHJcbiAgICAgICAgbGluZVdpZHRoOiBsaW5lV2lkdGgsXHJcbiAgICAgICAgbGluZUNhcDogXCJyb3VuZFwiIFxyXG4gICAgfTtcclxuXHJcbiAgICByZW5kZXJfbG93bGV2ZWwuQXJjKCBcclxuICAgICAgICBndWlDb250ZXh0LFxyXG4gICAgICAgIGNlbnRlclBvaW50LFxyXG4gICAgICAgIHRyYWNlLnJhZGl1cyxcclxuICAgICAgICB0cmFjZS5hbmdsZTAsXHJcbiAgICAgICAgdHJhY2UuYW5nbGUxLFxyXG4gICAgICAgIHJlbmRlck9wdGlvbnNcclxuICAgICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIExpbmUoZ3VpQ29udGV4dCwgdHJhY2UsIGxpbmVXaWR0aCwgY29sb3IpXHJcbntcclxuICAgIGxldCBzdGFydFBvaW50ID0gbmV3IFBvaW50KHRyYWNlLngwLCB0cmFjZS55MCk7XHJcbiAgICBsZXQgZW5kUG9pbnQgICA9IG5ldyBQb2ludCh0cmFjZS54MSwgdHJhY2UueTEpO1xyXG5cclxuICAgIGxldCByZW5kZXJPcHRpb25zID0geyBcclxuICAgICAgICBjb2xvcjogY29sb3IsXHJcbiAgICAgICAgZmlsbDogZmFsc2UsXHJcbiAgICAgICAgbGluZVdpZHRoOiBsaW5lV2lkdGgsXHJcbiAgICAgICAgbGluZUNhcDogXCJyb3VuZFwiIFxyXG4gICAgfTtcclxuXHJcbiAgICByZW5kZXJfbG93bGV2ZWwuTGluZSggXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICBzdGFydFBvaW50LFxyXG4gICAgICAgIGVuZFBvaW50LFxyXG4gICAgICAgIHJlbmRlck9wdGlvbnNcclxuICAgICk7XHJcbn1cclxuXHJcbi8vIExpbmUgd2lkdGggaXMgbm90IGluY2x1ZGVkIGFzIHBhcnQgb2YgdGhlIHRyYWNlIGFzIGl0IHdpbGwgZGVwZW5kIG9uIHRoZSBjdXJyZW50IGd1aSBzY2FsZSBmYWN0b3IuXHJcbmZ1bmN0aW9uIENpcmNsZShndWlDb250ZXh0LCB0cmFjZSwgbGluZVdpZHRoLCBjb2xvcilcclxue1xyXG5cclxuICAgIGxldCBjZW50ZXJQb2ludCA9IG5ldyBQb2ludCh0cmFjZS5jeDAsIHRyYWNlLmN5MCk7XHJcblxyXG4gICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7IFxyXG4gICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICBmaWxsOiBmYWxzZSxcclxuICAgICAgICBsaW5lV2lkdGg6IGxpbmVXaWR0aCxcclxuICAgICAgICBsaW5lQ2FwOiBcInJvdW5kXCIgXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5BcmMoIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsXHJcbiAgICAgICAgdHJhY2UucmFkaXVzLFxyXG4gICAgICAgIDAsIFxyXG4gICAgICAgIDIqTWF0aC5QSSxcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIEFyYywgTGluZSwgQ2lyY2xlXHJcbn07XHJcbiIsIlwidXNlIHN0cmljdFwiO1xyXG52YXIgcmVuZGVyX2xvd2xldmVsICAgICA9IHJlcXVpcmUoXCIuL3JlbmRlcl9sb3dsZXZlbC5qc1wiKTtcclxudmFyIFBvaW50ICAgICAgICAgICAgICAgPSByZXF1aXJlKFwiLi9wb2ludC5qc1wiKS5Qb2ludDtcclxuXHJcbi8vIExpbmUgd2lkdGggaXMgbm90IGluY2x1ZGVkIGFzIHBhcnQgb2YgdGhlIHRyYWNlIGFzIGl0IHdpbGwgZGVwZW5kIG9uIHRoZSBjdXJyZW50IGd1aSBzY2FsZSBmYWN0b3IuXHJcbmZ1bmN0aW9uIEFyYyhndWlDb250ZXh0LCB0cmFjZSwgbGluZVdpZHRoLCBjb2xvcilcclxue1xyXG5cclxuICAgIGxldCBjZW50ZXJQb2ludCA9IG5ldyBQb2ludCh0cmFjZS5jeDAsIHRyYWNlLmN5MCk7XHJcblxyXG4gICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7IFxyXG4gICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICBmaWxsOiBmYWxzZSxcclxuICAgICAgICBsaW5lV2lkdGg6IGxpbmVXaWR0aCxcclxuICAgICAgICBsaW5lQ2FwOiBcInJvdW5kXCIgXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5BcmMoIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsXHJcbiAgICAgICAgdHJhY2UucmFkaXVzLFxyXG4gICAgICAgIHRyYWNlLmFuZ2xlMCxcclxuICAgICAgICB0cmFjZS5hbmdsZTEsXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTtcclxufVxyXG5cclxuZnVuY3Rpb24gTGluZShndWlDb250ZXh0LCB0cmFjZSwgbGluZVdpZHRoLCBjb2xvcilcclxue1xyXG4gICAgbGV0IHN0YXJ0UG9pbnQgPSBuZXcgUG9pbnQodHJhY2UueDAsIHRyYWNlLnkwKTtcclxuICAgIGxldCBlbmRQb2ludCAgID0gbmV3IFBvaW50KHRyYWNlLngxLCB0cmFjZS55MSk7XHJcblxyXG4gICAgbGV0IHJlbmRlck9wdGlvbnMgPSB7IFxyXG4gICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICBmaWxsOiBmYWxzZSxcclxuICAgICAgICBsaW5lV2lkdGg6IGxpbmVXaWR0aCxcclxuICAgICAgICBsaW5lQ2FwOiBcInJvdW5kXCIgXHJcbiAgICB9O1xyXG4gICAgcmVuZGVyX2xvd2xldmVsLkxpbmUoXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICBzdGFydFBvaW50LFxyXG4gICAgICAgIGVuZFBvaW50LFxyXG4gICAgICAgIHJlbmRlck9wdGlvbnNcclxuICAgICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIFBvbHlnb24oZ3VpQ29udGV4dCwgc2VnbWVudHMsIGxpbmVXaWR0aCwgY29sb3IsIGlzUG9zaXRpdmUpXHJcbntcclxuICAgIGxldCB2ZXJ0aWNlcyA9IFtdO1xyXG4gICAgZm9yIChsZXQgaSBvZiBzZWdtZW50cylcclxuICAgIHtcclxuICAgICAgICBsZXQgcG9pbnQxID0gbmV3IFBvaW50KGkueDAsIGkueTApO1xyXG4gICAgICAgIHZlcnRpY2VzLnB1c2gocG9pbnQxKTtcclxuICAgIH1cclxuICAgIGxldCBjb21wb3NpdGlvblR5cGUgPSAoaXNQb3NpdGl2ZSkgPyBcInNvdXJjZS1vdmVyXCIgOiBcImRlc3RpbmF0aW9uLW91dFwiO1xyXG5cclxuICAgIGxldCByZW5kZXJPcHRpb25zID0geyBjb2xvcjogY29sb3IsXHJcbiAgICAgICAgZmlsbDogdHJ1ZSxcclxuICAgICAgICBjb21wb3NpdGlvblR5cGU6IGNvbXBvc2l0aW9uVHlwZVxyXG4gICAgfTtcclxuXHJcbiAgICByZW5kZXJfbG93bGV2ZWwuSXJyZWd1bGFyUG9seWdvbiggXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICB2ZXJ0aWNlcyxcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIEFyYywgTGluZSwgUG9seWdvblxyXG59O1xyXG4iLCJcInVzZSBzdHJpY3RcIjtcclxudmFyIHJlbmRlcl9sb3dsZXZlbCAgICAgPSByZXF1aXJlKFwiLi9yZW5kZXJfbG93bGV2ZWwuanNcIik7XHJcbnZhciBQb2ludCAgICAgICAgICAgICAgID0gcmVxdWlyZShcIi4vcG9pbnQuanNcIikuUG9pbnQ7XHJcblxyXG5cclxuZnVuY3Rpb24gR2V0UG9seWdvblZlcnRpY2llcyhyYWRpdXMsIG51bWJlclNpemVkKVxyXG57XHJcbiAgICAvLyBXaWxsIHN0b3JlIHRoZSB2ZXJ0aWNpZXMgb2YgdGhlIHBvbHlnb24uXHJcbiAgICBsZXQgcG9seWdvblZlcnRpY2llcyA9IFtdO1xyXG4gICAgLy8gQXNzdW1lcyBhIHBvbHlnb24gY2VudGVyZWQgYXQgKDAsMClcclxuICAgIC8vIEFzc3VtZXMgdGhhdCBhIGNpcmN1bXNjcmliZWQgcG9seWdvbi4gVGhlIGZvcm11bGFzIHVzZWQgYmVsbyBhcmUgZm9yIGEgaW5zY3JpYmVkIHBvbHlnb24uIFxyXG4gICAgLy8gVG8gY29udmVydCBiZXR3ZWVuIGEgY2lyY3Vtc2NyaWJlZCB0byBhbiBpbnNjcmliZWQgcG9seWdvbiwgdGhlIHJhZGl1cyBmb3IgdGhlIG91dGVyIHBvbHlnb24gbmVlZHMgdG8gYmUgY2FsY3VsYXRlZC5cclxuICAgIC8vIFNvbWUgb2YgdGhlIHRoZW9yeSBmb3IgYmVsb3cgY29tZXMgZnJvbSBcclxuICAgIC8vIGh0dHBzOi8vd3d3Lm1hYS5vcmcvZXh0ZXJuYWxfYXJjaGl2ZS9qb21hL1ZvbHVtZTcvQWt0dW1lbi9Qb2x5Z29uLmh0bWxcclxuICAgIC8vIC8vIEl0cyBpcyBzb21lIGJhc2ljIHRyaWcgYW5kIGdlb21ldHJ5XHJcbiAgICBsZXQgYWxwaGEgPSAoMipNYXRoLlBJIC8gKDIqbnVtYmVyU2l6ZWQpKTtcclxuICAgIGxldCBpbnNjcmliZWRfcmFkaXVzID0gcmFkaXVzIC9NYXRoLmNvcyhhbHBoYSk7XHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBudW1iZXJTaXplZDsgaSsrKSBcclxuICAgIHtcclxuXHJcbiAgICAgICAgcG9seWdvblZlcnRpY2llcy5wdXNoKG5ldyBQb2ludChpbnNjcmliZWRfcmFkaXVzICogTWF0aC5jb3MoMiAqIE1hdGguUEkgKiBpIC8gbnVtYmVyU2l6ZWQpLCBpbnNjcmliZWRfcmFkaXVzICogTWF0aC5zaW4oMiAqIE1hdGguUEkgKiBpIC8gbnVtYmVyU2l6ZWQpKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHBvbHlnb25WZXJ0aWNpZXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIFNxdWFyZShndWlDb250ZXh0LCBjZW50ZXJQb2ludCwgZGlhbWV0ZXIsIGRyaWxsRGlhbWV0ZXIsIGNvbG9yVmlhLCBjb2xvckRyaWxsKVxyXG57XHJcbiAgICBsZXQgcG9seWdvblZlcnRpY2llcyA9IEdldFBvbHlnb25WZXJ0aWNpZXMoZGlhbWV0ZXIvMiwgNCk7XHJcblxyXG4gICAgLy8gVGhpcyBpcyBuZWVkZWQgaW4gb3JkZXIgc28gdGhhdCB0aGUgc2hhcGUgaXMgcmVuZGVyZWQgd2l0aCBjb3JyZWN0IG9yaWVudGF0aW9uLCBpZSB0b3Agb2YgXHJcbiAgICAvLyBzaGFwZSBpcyBwYXJhbGxlbCB0byB0b3AgYW5kIGJvdHRvbSBvZiB0aGUgZGlzcGxheS5cclxuICAgIGxldCBhbmdsZSA9IDQ1O1xyXG5cclxuICAgIGxldCByZW5kZXJPcHRpb25zID0ge1xyXG4gICAgICAgIGNvbG9yOiBjb2xvclZpYSxcclxuICAgICAgICBmaWxsOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICByZW5kZXJfbG93bGV2ZWwuUmVndWxhclBvbHlnb24oIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsIFxyXG4gICAgICAgIHBvbHlnb25WZXJ0aWNpZXMsXHJcbiAgICAgICAgYW5nbGUsXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTtcclxuXHJcbiAgICAvLyBEcmF3IGRyaWxsIGhvbGVcclxuICAgIHJlbmRlck9wdGlvbnMgPSB7XHJcbiAgICAgICAgY29sb3I6IGNvbG9yRHJpbGwsXHJcbiAgICAgICAgZmlsbDogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZSggXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICBjZW50ZXJQb2ludCxcclxuICAgICAgICBkcmlsbERpYW1ldGVyLzIsIFxyXG4gICAgICAgIHJlbmRlck9wdGlvbnNcclxuICAgICk7IFxyXG59XHJcblxyXG5mdW5jdGlvbiBPY3RhZ29uKGd1aUNvbnRleHQsIGNlbnRlclBvaW50LCBkaWFtZXRlciwgZHJpbGxEaWFtZXRlciwgY29sb3JWaWEsIGNvbG9yRHJpbGwpXHJcbntcclxuICAgIC8vIFdpbGwgc3RvcmUgdGhlIHZlcnRpY2llcyBvZiB0aGUgcG9seWdvbi5cclxuICAgIGxldCBwb2x5Z29uVmVydGljaWVzID0gR2V0UG9seWdvblZlcnRpY2llcyhkaWFtZXRlci8yLCA4KTtcclxuICAgIGxldCBhbmdsZSA9ICg0NS8yKTtcclxuXHJcbiAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHsgXHJcbiAgICAgICAgY29sb3I6IGNvbG9yVmlhLFxyXG4gICAgICAgIGZpbGw6IHRydWUsXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5SZWd1bGFyUG9seWdvbiggXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICBjZW50ZXJQb2ludCwgXHJcbiAgICAgICAgcG9seWdvblZlcnRpY2llcyxcclxuICAgICAgICBhbmdsZSxcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApO1xyXG5cclxuICAgIC8vIERyYXcgZHJpbGwgaG9sZVxyXG4gICAgcmVuZGVyT3B0aW9ucyA9IHtcclxuICAgICAgICBjb2xvcjogY29sb3JEcmlsbCxcclxuICAgICAgICBmaWxsOiB0cnVlLFxyXG4gICAgfTtcclxuXHJcbiAgICByZW5kZXJfbG93bGV2ZWwuQ2lyY2xlKCBcclxuICAgICAgICBndWlDb250ZXh0LFxyXG4gICAgICAgIGNlbnRlclBvaW50LFxyXG4gICAgICAgIGRyaWxsRGlhbWV0ZXIvMiwgXHJcbiAgICAgICAgcmVuZGVyT3B0aW9uc1xyXG4gICAgKTsgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIFJvdW5kKGd1aUNvbnRleHQsIGNlbnRlclBvaW50LCBkaWFtZXRlciwgZHJpbGxEaWFtZXRlciwgY29sb3JWaWEsIGNvbG9yRHJpbGwpXHJcbntcclxuXHJcbiAgICBsZXQgcmVuZGVyT3B0aW9ucyA9IHtcclxuICAgICAgICBjb2xvcjogY29sb3JWaWEsXHJcbiAgICAgICAgZmlsbDogdHJ1ZSxcclxuICAgIH07XHJcblxyXG4gICAgcmVuZGVyX2xvd2xldmVsLkNpcmNsZSggXHJcbiAgICAgICAgZ3VpQ29udGV4dCxcclxuICAgICAgICBjZW50ZXJQb2ludCxcclxuICAgICAgICBkaWFtZXRlci8yLCBcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApOyBcclxuICAgIFxyXG4gICAgLy8gRHJhdyBkcmlsbCBob2xlXHJcbiAgICByZW5kZXJPcHRpb25zID0ge1xyXG4gICAgICAgIGNvbG9yOiBjb2xvckRyaWxsLFxyXG4gICAgICAgIGZpbGw6IHRydWUsXHJcbiAgICB9O1xyXG5cclxuICAgIHJlbmRlcl9sb3dsZXZlbC5DaXJjbGUoIFxyXG4gICAgICAgIGd1aUNvbnRleHQsXHJcbiAgICAgICAgY2VudGVyUG9pbnQsXHJcbiAgICAgICAgZHJpbGxEaWFtZXRlci8yLCBcclxuICAgICAgICByZW5kZXJPcHRpb25zXHJcbiAgICApOyBcclxuXHJcbiAgICAvLyBSZXN0b3JlcyBjb250ZXh0IHRvIHN0YXRlIHByaW9yIHRvIHRoaXMgcmVuZGVyaW5nIGZ1bmN0aW9uIGJlaW5nIGNhbGxlZC4gXHJcbiAgICBndWlDb250ZXh0LnJlc3RvcmUoKTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgICBTcXVhcmUsIE9jdGFnb24sIFJvdW5kLFxyXG59O1xyXG4iLCJcInVzZSBzdHJpY3RcIjtcclxuXHJcbmxldCB2ZXJzaW9uU3RyaW5nX01ham9yID0gMjtcclxubGV0IHZlcnNpb25TdHJpbmdfTWlub3IgPSAzO1xyXG5sZXQgdmVyc2lvblN0cmluZ19QYXRjaCA9IDE7XHJcblxyXG5mdW5jdGlvbiBHZXRWZXJzaW9uU3RyaW5nKClcclxue1xyXG5cclxuICAgIGxldCByZXN1bHQgPSAnVicgKyBTdHJpbmcodmVyc2lvblN0cmluZ19NYWpvcikgKyAnLicgKyBTdHJpbmcodmVyc2lvblN0cmluZ19NaW5vcikgKyAnLicgKyBTdHJpbmcodmVyc2lvblN0cmluZ19QYXRjaClcclxuXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICAgIEdldFZlcnNpb25TdHJpbmdcclxufTtcclxuIl19
