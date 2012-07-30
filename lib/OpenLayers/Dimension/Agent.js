/* Copyright (c) 2006-2011 by OpenLayers Contributors (see authors.txt for
* full list of contributors). Published under the Clear BSD license.
* See http://svn.openlayers.org/trunk/openlayers/license.txt for the
* full text of the license. */


/**
 * @requires OpenLayers/Control/DimensionManager.js
 */

/**
 * Class: OpenLayers.DimensionAgent.WMS
 * Class to display and animate WMS layers across dimension.
 * This class is created by {OpenLayers.Control.DimensionManager} instances
 *
 * Inherits From:
 *  - <OpenLayers.Class>
 */
OpenLayers.DimensionAgent = OpenLayers.Class({
    /**
     * APIProperty: dimensionManager
     * {<OpenLayers.Control.DimensionManager>}
     */
    dimensionManager : null,
    /**
     * APIProperty: dimension
     * {String}
     */
    dimension: null,
    /**
     * Property: canTick
     * {Boolean}
     */
    canTick : true,
    /**
     * Property: values
     * {Array(Number)}
     */
    values : null,
    /**
     * Property: range
     * {Array(Date)}
     */
    range : null,
    /**
     * Property: layers
     * {Array(<OpenLayers.Layer>)}
     */
    layers : null,
    /**
     * APIProperty: rangeMode
     * {String} This property will control if and how the animation dimension is
     *     translated into a dimension range to display on each tick
     *     Must be one of:
     *      false - set to false to only use single value dimension parameters (Default)
     *      "range" - use a value range for dimension
     *      "cumulative" - use a range from the start value to the current value
     */
    rangeMode : false,
    /**
     * APIProperty: rangeInterval
     * {Number} Value to add or subtract from the current value to build
     *      a dimension range to display with each tick.
     *      ONLY used if intervalMode is 'range'
     */
    rangeInterval : null,
    /**
     * Constructor: OpenLayers.Control.DimensionManager
     * Create a new dimension manager control for temporal layers.
     *
     * Parameters:
     * options - {Object} Optional object whose properties will be set on the
     *     control.
     */
    initialize : function(options) {

        OpenLayers.Util.extend(this, options);

        this.events = new OpenLayers.Events(this, null);

        if(this.eventListeners instanceof Object) {
            this.events.on(this.eventListeners);
        }

        if(this.layers && this.layers.length) {
            var dimensionConfig = this.buildRangeAndValues(this.layers);
            this.range = dimensionConfig.range;
            this.values = dimensionConfig.values;
            for(var i=0;i<this.layers.length;i++){
                var layer = this.layers[i];
                layer.calculateInRange = OpenLayers.Function.bind(this.calculateLayerInRange, this, layer);
            }
        }
    },

    destroy : function() {
        this.events.destroy();
        this.dimensionManager.events.unregister('tick', this, this.onTick);
        this.dimensionManager = this.layers = this.range = this.values = null;
    },

    onTick : function() {
        //Implemented By Subclasses
    },

    addLayer : function(layer) {
        this.layers = (!this.layers) ? [layer] : this.layers.concat(layer);
        var config = this.buildRangeAndValues(layer);
        var dimRange = config.range;
        var values = config.values;
        if(dimRange.max > this.range.max) {
            this.range.max = dimRange.max;
        }
        if(dimRange.min < this.range.min) {
            this.range.min = dimRange.min;
        }
        if(this.values && values){
            this.values = OpenLayers.Control.DimensionManger.combineLists(this.values||[],values);
        } else if (values){
            this.values = values;
        }
        layer.calculateInRange = OpenLayers.Function.bind(this.calculateLayerInRange, this, layer);
    },

    removeLayer : function(layer) {
        for(var i = 0, len = this.layers.length; i < len; i++) {
            if(layer == this.layers[i]) {
                this.layers.splice(i, 1);
                if(this.layers.length){
                    var lyrRange = layer.metadata[this.dimension + "Range"];
                    //if layer was at the edge then adjust dimension model
                    if(lyrRange.min == this.range.min || lyrRange.max == this.range.max){
                        var config = this.buildRangeAndValues(this.layers);
                        this.range = config.range;
                        this.values = config.values;
                    }
                } else {
                    //if we have no more layers then nullify the layers
                    //and dimensional model
                    this.range = this.values = this.layers = null;
                }
                break;
            }
        }
    },

    buildRangeAndValues : function(layers) {
        var values = [], dimRange;
        for(var i = 0, len = layers.length; i < len; i++) {
            dimRange = (layers[i].metadata) ? layers[i].metadata[this.dimension+'Range'] : null;
            if(!dimRange && layers[i].dimensions && layers[i].dimensions[this.dimension]) {
                var ranges = OpenLayers.Control.DimensionManager.ogcToRangeRes(layers[i].dimensions[this.dimension]);
                if(ranges.length==1){
                    layers[i].metadata[this.dimension+"Range"]={
                        min: ranges[0][0],
                        max: ranges[0][1],
                        resolution: (ranges[0][2]=='list') ? false : ranges[0][2]
                    };
                    if(ranges[0][2]=='list'){
                        values = OpenLayers.Control.DimensionManager.combineLists(values,layers[i].dimensions[this.dimension].values);
                    }
                } else {
                    var min = ranges[0][0],
                    max = ranges[0][1],
                    res = (ranges[0][2]=='list') ? false : ranges[0][2];
                    if(ranges[0][2]=='list'){
                        values = OpenLayers.Control.DimensionManager.combineLists(values,layers[i].dimensions[this.dimension].values);
                    }
                    for(var j=1; j<ranges.length; j++){
                        var r = ranges[j];
                        if(r[0]<min){ min = r[0]; }
                        if(r[1]>max){ max = r[1]; }
                        if(res && r[2] != 'list' && r[2] < res){
                            res = r[2];
                        } else if(r[2] == 'list') {
                            res = false;
                            values = OpenLayers.Control.DimensionManager.combineLists(values,layers[i].dimensions[this.dimension].values);
                        }
                    }
                    layers[i].metadata[this.dimension+"Range"]={
                        'min': min,
                        'max': max,
                        'resolution': res
                    };
                }
                dimRange = layers[i].metadata[this.dimension+"Range"];
            }
        }
        
        return {
            'range' : dimRange,
            'values' : values.length ? values : null
        };
    },
    
    calculateLayerInRange: function(layer){
        var inRange = OpenLayers.Layer.prototype.calculateInRange.call(layer);
        if(inRange){ 
            var value = this.currentValue || this.dimensionManager.currentValue;
            if(value){
                var range = [layer.metadata[this.dimension + "Range"].min,layer.metadata[this.dimension + "Range"].max];
                if(value<range[0] || value>range[1]){
                    inRange = false;
                }
            }
        }
        return inRange;
    },

    CLASS_NAME : 'OpenLayers.DimensionAgent'
});