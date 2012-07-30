(!OpenLayers.Dimension) {
    OpenLayers.Dimension = {};
}

OpenLayers.Dimension.Model = OpenLayers.Class({
    
    /**
     * Constant: EVENT_TYPES
     *
     * Supported event types:
     *  - *rangemodified* Triggered when layers are added or removed which
     *      affect the range of values available.
     *  - *listmodified* Triggered when layers are added or removed which
     *      affect the list of values available.
     */
    EVENT_TYPES : ["rangemodified", "listmodified"],
    
    numericRE : /^\d+$|^\d+\.\d+$|^\.\d+$/,

    layers: null,
    dimension: null,
    map: null,
    syncToMap: true,
    values:null,
    range:null,
    initialize: function(options) {
        this.events = new OpenLayers.Events(this, null);

        if(options.eventListeners instanceof Object) {
            this.events.on(options.eventListeners);
        }
        
        if(options.map){
            this.setMap(options.map);
        } else if(options.layers){
            this.setLayers(options.layers);
        } else if(options.range || options.values){
            this.range = options.range;
            this.values = options.values;
        }
        
        //ensure that no processed option is passed to the extend function
        delete options.eventListeners;
        delete options.map;
        delete options.layers;
        delete options.range;
        delete options.values;
        
        OpenLayers.Util.extend(this, options);
    },
    setMap: function(map) {
        this.map = map;
        if(this.syncToMap){
            this.layers = this.map.layers.slice(0);
            this.maps.events.on({
                'addlayer': this.onMapAddLayer,
                'removelayer': this.onMapRemoveLayer,
                scope: this
            });
        }
    },
    setLayers: function(layers){
        this.layers = layers;
        this.valueCache = this.range = this.listValues = null;
        for(var i=0, len=layers.length; i<len; i++){
            this.addLayer(layers[i]);
        }
    },
    
    addLayer: function(layer) {
        if(layer.dimensions && layer.dimensions[this.dimension]) {
            var dim = layer.dimensions[this.dimension];
            var dimConfig = this.processDimensionValues(dim);
            layer.metadata[this.dimension + 'Info'] = OpenLayers.Util.extend({}, dimConfig);
            this.layers.push(layer);
            this.combineDimensionInfo(dimConfig);
        }
    },
    removeLayer: function(layer) {
        if(layer.metadata[this.dimension + 'Info']) {
            var ndx = OpenLayers.Util.indexOf(this.layers,layer);
            this.layers.splice(ndx,1);
            if(!this.layers.length){
                //clear the model & call destroy
                this.clearModel();
                this.destroy();
            } else {
                var dim = layer.metadata[this.dimension + 'Info'];
                this.removeDimensionInfo(dimConfig);
            }
        }
    },
    onMapAddLayer: function(evt){
        this.addLayer(evt.layer);
    },
    onMapRemoveLayer: function(evt){
        this.removeLayer(evt.layer);
    },
    processDimensionValues: function(dim) {
        var range = [], valList = [], resolution;
        var values = dimension.values;
        for(var i = 0, ii = values.length; i < ii; ++i) {
            if(typeof(values[i])=='string' && values[i].indexOf("/")>-1){
                var valueParts = values[i].split("/");
                if(valueParts.length > 1) {
                    for(var j=0,jj=valueParts.length;j<jj;++j){
                        if(this.numericRE.test(valueParts[j])){
                            valueParts[j] = parseFloat(valueParts[j]);
                        }
                    }
                    var min = valueParts[0], max = valueParts[1], res = valueParts[2];
                    if(this.dimension=='time'){
                        min = new Date(min).getTime();
                        max = new Date(max).getTime();
                        res = this.parseIsoPeriod(res);
                    }
                    //TODO Handle array of interval/res values
                    if(min<range[0]){ range[0] = min; }
                    if(max>range[1]){ range[1] = max; }
                    //TODO Handle various resolution values
                    if(!resolution){ resolution = res; } 
                }
            } else {
                var v = values[i];
                if(typeof(v)=='string' && this.numericRE.match(v)){
                    v = parseFloat(v);
                }
                if(this.dimension == 'time'){
                    v = new Date(v).getTime();
                }
                if(v<range[0]){ range[0]=v; }
                else if(v>range[1]){ range[1]=v; }
                valList[valList.length] = v;
            }
        }
        var retObj = {
            'range': range,
            'resolution': resolution,
            'values': valList.length ? valList : null
        };
        return retObj;
    },
    combineDimensionInfo: function(info) {
        var rangeMod = valMod = resMod = false;
        //check range and adjust and fire event as needed
        if(!this.range){ this.range = []; }
        if(info.range[0]<this.range[0]){
            this.range[0] = info.range[0];
            rangeMod = true;
        }
        if(info.range[1]>this.range[1]){
            this.range[1] = info.range[1];
            rangeMod = true;
        }
        //check values list, combine, and fire event as needed
        if(info.values){
            if(!this.valueCache){ this.valueCache = {}; }
            var len = this.values && this.values.length; 
            this.values = this.combineLists(info.values,null,this.valueCache);
            if(this.values.length != len){
                valMod = true;
            }
        }
        if(info.resolution){
        //TODO - What about various resolution values (fire event?)
        //using the smallest resolution
            var res = this.resolution;
            if(this.resolution){
                if(info.resolution != this.resolution){
                    resMod = true;
                    if(info.resolution<this.resolution){
                        this.resolution = info.resolution;
                    }
                }
            } else {
                resMod = true;
                this.resolution = info.resolution;
            }
            if(resMod){
                this.events.triggerEvent('resolutionmodified',{
                    resolution: this.resolution,
                    modelModified: this.resolution != res
                });
            }
        }      
        if(rangeMod){
            this.events.triggerEvent('rangemodified',{
                range: this.range
            });    
        }
        if(valMod){
            this.events.triggerEvent('valuesmodified',{
                values: this.values
            });
        }
        
    },
    removeDimensionInfo: function(info) {
        var rangeMod = valMod = resMod = false;
        var range = this.range || [];
        if(info.values){
            var len = range.length;
            this.values = this.removeListValues(info.values, this.valueCache);
            if(this.values.length<len){
                valMod = true;
                if(info.values[0]<this.values[0]){
                    rangeMod = true;
                    range[0] = this.values[0];
                }
                if(info.values[1]>this.values[1]){
                    rangeMod = true;
                    range[1] = this.values[1];
                }
            }
            this.range = range;
        } else {
            if(info.range[0] == range[0] || info.range[1] == range[1]){
                this.range = this.calculateRange();
            }
        }
        if(info.resolution){
            if(info.resolution == this.resolution){
                this.getMinimumResolution();
            }
        }
    },
    combineLists: function(list1, list2, listCache) {
        var cache = (listCache === false) ? {} : listCache || this.valueCache || {};
        var arr = [];
        var process = function(list){
            for(var i = 0, len = list.length; i < len; i++) {
                var val = list[i];
                if(cache[val]){
                    ++cache[val];
                } else {
                    cache[val]=1;
                }
            }
        };
        process(list1);
        
        if(list2) { process(list2); }
        
        for(var k in cache) {
            if(cache.hasOwnProperty(k) && cache[k]>0) {
                arr[arr.length] = k;
            }
        }
        return arr;
    },
    removeListValues: function(values, valueCache){
        var cache = (valueCache === false) ? false : valueCache || this.valueCache;
        if(!cache){
            return values;
        } else {
            var arr = [];
            for(var i = 0, len = list.length; i < len; i++){
                var val = list[i];
                if(cache[val]){
                    if(--cache[val] === 0){
                        delete cache[val];
                    }
                }
            }
            for(var k in cache) {
                if(cache.hasOwnProperty(k) && cache[k]>0) {
                    arr[arr.length] = k;
                }
            }
            return arr;
        }
    },
    getMinimumResolution: function(layers){
        layers = layers || this.layers;
        if(layers.length === 1){
            return layers[0].metadata[this.dimension + 'Info'].resolution;
        } else {
            var minRes = Number.MAX_VALUE;
            for(var i=0,len=layers.length;i<len;++i){
                var res = layers[i].metadata[this.dimension + 'Info'].resolution; 
                if(res < minRes){
                    minRes = res; 
                }
            }
            return minRes;
        }
    },
    getMaximumResolution: function(layers){
        layers = layers || this.layers;
        if(layers.length === 1){
            return layers[0].metadata[this.dimension + 'Info'].resolution;
        } else {
            var minRes = Number.MIN_VALUE;
            for(var i=0,len=layers.length;i<len;++i){
                var res = layers[i].metadata[this.dimension + 'Info'].resolution; 
                if(res > minRes){
                    minRes = res; 
                }
            }
            return minRes;
        }
    },
    getLowestCommonResolution: function(layers){
        //TODO - implement
        /**
        layers = layers || this.layers;
        var res = layers[0].metadata[this.dimension + 'Info'].resolution;
        if(layers.length === 1){
            return res;
        } else {
            for(var i=1,len=layers.length;i<len;++i){
                var nextRes = layers[i].metadata[this.dimension + 'Info'].resolution; 
                
            }
        }
        **/
    },
    getHighestCommonResolution: function(layers){
        //TODO - implement
        /**
        layers = layers || this.layers;
        var res = layers[0].metadata[this.dimension + 'Info'].resolution;
        if(layers.length === 1){
            return res;
        } else {
            for(var i=1,len=layers.length;i<len;++i){
                var nextRes = layers[i].metadata[this.dimension + 'Info'].resolution; 
                
            }
        }
        **/
    },
    calculateRange: function(layers){
        layers = layers || this.layers;
        var range = layers[0].metadata[this.dimension + 'Info'].range;
        if(layers.length === 1){
            return range;
        } else {
            for(var i=1,len=layers.length;i<len;++i){
                var nextRange = layers[i].metadata[this.dimension + 'Info'].range; 
                if(nextRange[0]<range[0]){
                    range[0] = nextRange[0];
                }
                if(nextRange[1]>range[1]){
                    range[1] = nextRange[1];
                }
            }
        }
    }
});
