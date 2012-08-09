/* Copyright (c) 2006-2011 by OpenLayers Contributors (see authors.txt for
* full list of contributors). Published under the Clear BSD license.
* See http://svn.openlayers.org/trunk/openlayers/license.txt for the
* full text of the license. */


/**
 * @requires OpenLayers/BaseTypes.js
 * @requires OpenLayers/BaseTypes/Class.js
 * @requires OpenLayers/BaseTypes/Date.js
 * @requires OpenLayers/Dimension/Agent.js
 */

/**
 * Class: OpenLayers.Dimension.Agent.WMS
 * Class to display and animate WMS layers across dimensions.
 * This class is created by {OpenLayers.Control.DimensionManager} instances
 *
 * Inherits From:
 *  - <OpenLayers.Dimension.Agent>
 */
OpenLayers.Dimension.Agent.WMS = OpenLayers.Class(OpenLayers.Dimension.Agent, {
    /**
     * APIProperty: intervalMode
     * {String} If a wms layer has distinct valid time intervals,
     *     then this property will control if and how the animation time is
     *     translated into a valid time instance for the layer
     *     Must be one of:
     *     "lastValid" - continue to display it using the last valid time within
     *         the overall control time range
     *     "nearest" - (Default) use the nearest valid time within the overall
     *         control time range.
     *     "exact" - only display the layer when there's an exact match (to the
     *         grainularity of the step unit) in the control time and an interval
     */
    intervalMode : 'nearest',

    /**
     * Constructor: OpenLayers.Control.DimensionManager.WMS
     * Create a new Dimension manager control for temporal WMS layers.
     *
     * Parameters:
     * options - {Object} Optional object whose properties will be set on the
     *     control.
     */
    initialize : function(options) {
        OpenLayers.Dimension.Agent.prototype.initialize.call(this, options);
        //add layer loadend listeners
        if(this.layers) {
            for(var i = 0, len = this.layers.length; i < len; i++) {
                this.layers[i].events.on({
                    'loadend' : this.onLayerLoadEnd,
                    'loadstart' : this.onLayerLoadStart,
                    scope : this
                });
            }
        }
    },

    addLayer : function(layer) {
        layer.events.on({
            'loadend' : this.onLayerLoadEnd,
            'loadstart' : this.onLayerLoadStart,
            scope : this
        });
        OpenLayers.Dimension.Agent.prototype.addLayer.call(this, layer);
    },

    removeLayer : function(layer) {
        layer.events.un({
            'loadend' : this.onLayerLoadEnd,
            'loadstart' : this.onLayerLoadStart,
            scope : this
        });
        OpenLayers.Dimension.Agent.prototype.removeLayer.call(this, layer);
    },

    destroy : function() {
        for(var i = this.layers.length - 1; i > -1; i--) {
            this.removeLayer(this.layers[i]);
        }
        OpenLayers.Dimension.Agent.prototype.destroy.call(this);
    },

    onTick : function(evt) {
        this.currentTime = evt.currentTime || this.dimensionManager.currentTime;
        //console.debug('CurrentTime:' + this.currentTime.toString());
        var inrange = this.currentTime <= this.range[1] && this.currentTime >= this.range[0];
        //this is an inrange flag for all the entire value range of layers managed by
        //this dimension agent and not a specific layer
        if(inrange) {
            var validLayers = OpenLayers.Array.filter(this.layers, function(lyr) {
                return lyr.visibility && lyr.calculateInRange();
            });
            this.loadQueue = validLayers.length;
            
            this.canTick = !this.loadQueue;
            console.debug('WMS Agent QueueCount:' + this.loadQueue);
            
            for(var i=0;i<validLayers.length;i++){
                this.applyDimension(validLayers[i], this.currentTime);
            }
        }
    },

    applyDimension : function(layer, value) {
        var minValue;
        if(this.tickMode == 'range'){
            minValue = value - this.rangeInterval;
        } 
        else if (this.tickMode == 'cumulative'){
            minValue = this.range[0];
        } else {
            //tickMode is 'track'
            if(this.dimensionManager.snapToList && layer.metadata[this.dimension+'Info'].list){
                //find where this value fits into
                var list = layer.metadata[this.dimension+'Info'].list;
                var match = this.findNearestValues(value, list);
                if(!match){
                        value = null;
                } else if(match.exact == -1){
                    if(this.intervalMode == 'lastValid'){
                        value = (match.before > -1) ? list[match.before] : list[0];
                    } else if(this.intervalMode == 'nearest'){
                        var before = (match.before > -1) ? match.before : 0;
                        var after = (match.after >-1) ? match.after : list.length-1;
                        if(Math.abs(value - list[before]) > Math.abs(value - list[after])){
                            value = list[after];
                        } else {
                            value = list[before];
                        }
                    } else if(this.intervalMode == 'exact'){
                        value = null;
                    }
                }
                //value remains same if the match is exact regardless of intervalMode
            }
        }
        if(!value){
            this.onLayerLoadEnd();
        } else {
            //actually convert minValue & value into a new request
            var titleDim = this.dimension.substr(0,1).toUpperCase()+this.dimension.substr(1);
            if(this['request'+titleDim]){
                this['request'+titleDim](layer,value,minValue);
            } else {
                this.requestValue(layer,value,minValue,titleDim);
            }
        }
    },
    requestTime: function(layer, time, minTime){
        var pad = OpenLayers.Number.zeroPad;
        var param = {
            time:''
        };
        var truncDate = function(date, unit){
            return date['getUTC'+unit]();
        };
        var buildDateString = function(date, unit){
            var str = '';
            //purposefully falling through to time resolution
            switch(unit){
                case OpenLayers.TimeUnit.YEARS:
                    str += pad(truncDate(date, OpenLayers.TimeUnit.YEARS), 4);
                case OpenLayers.TimeUnit.MONTHS:
                    str += '-' + pad(truncDate(date, OpenLayers.TimeUnit.MONTHS) + 1, 2);
                case OpenLayers.TimeUnit.DAYS:
                    str += '-' + pad(truncDate(date, OpenLayers.TimeUnit.DAYS), 2);
                case OpenLayers.TimeUnit.HOURS:
                    str += 'T' + pad(truncDate(date, OpenLayers.TimeUnit.HOURS), 2) + ':00Z';
                    break; 
                case OpenLayers.TimeUnit.MINUTES:
                case OpenLayers.TimeUnit.SECONDS:
                    str = OpenLayers.Date.toISOString(date);
                    break;
            }
        };
        var units = this.dimensionManager.timeUnits;
        if(minTime){
            param.time += buildDateString(new Date(minTime), units) + '/';
        }
        param.time += buildDateString(new Date(time), units);
        layer.mergeNewParams(param);
    },
    requestElevation: function(layer, elev, minElev){
        var param = {
            elevation: (minElev) ? minElev + '/' + elev : elev
        };
        layer.mergeNewParams(param);
    },
    requestValue: function(layer, val, minVal, dimName){
        var param = {};
        var reqVal = (minVal) ? minVal + '/' + val : val;
        param['dim'+dimName] = reqVal;
        layer.mergeNewParams(param);
    },

    /**
     *
     * @param {Object} testValue
     * @param {Array[{Numbers}]} MUST be a sorted value array
     */
    findNearestValues : function(testValue, values) {
        return OpenLayers.Control.DimensionManager.findNearestValues(testValue,values);
    },

    onLayerLoadEnd : function() {
        --this.loadQueue;
        console.debug('QueueCount:' + this.loadQueue);
        if(this.loadQueue <= 0) {
            this.canTick = true;
            console.debug('canTick:TRUE');
        }
    },

    CLASS_NAME : 'OpenLayers.Dimension.Agent.WMS'
});
