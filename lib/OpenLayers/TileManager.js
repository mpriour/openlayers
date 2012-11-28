OpenLayers.TileManager = OpenLayers.Class({
    
    /**
     * APIProperty: map
     * {<OpenLayers.Map>} The map to manage tiles on.
     */
    map: null,
    
    /**
     * APIProperty: tileCacheSize
     * {Number} Number of image elements to keep referenced for fast reuse.
     * Default is 512.
     */
    tileCacheSize: 512,

    /**
     * APIProperty: moveDelay
     * {Number} Delay in milliseconds after a map's move event before loading
     * tiles. Default is 100.
     */
    moveDelay: 100,
    
    /**
     * APIProperty: zoomDelay
     * {Number} Delay in milliseconds after a map's zoomend event before loading
     * tiles. Default is 200.
     */
    zoomDelay: 200,
    
    /**
     * Property: tileQueueId
     * {Number} The id of the <drawTilesFromQueue> animation.
     */
    tileQueueId: null,

    /**
     * Property: tileQueue
     * {Array(<OpenLayers.Tile>)} Tiles queued for drawing.
     */
    tileQueue: null,
    
    /**
     * Property: tileCache
     * {Object} Cached image elements, keyed by URL. This is shared among all
     * TileManager instances.
     */
    tileCache: {},
    
    /**
     * Property: tileCacheIndex
     * {Array<String>} URLs of cached tiles; first entry is least recently
     * used. This is shared among all TileManager instances.
     */
    tileCacheIndex: [],    
    
    /** 
     * Constructor: OpenLayers.TileManager
     * Constructor for a new <OpenLayers.TileManager> instance.
     * 
     * Parameters:
     * options - {Object} Configuration for this instance.
     *
     * Required options:
     * map - {<OpenLayers.Map>} The map to manage tiles on.
     */   
    initialize: function(options) {
        OpenLayers.Util.extend(this, options);
        this.tileQueue = [];
        var map = this.map;
        for (var i=0, ii=map.layers.length; i<ii; ++i) {
            this.addLayer({layer: map.layers[i]});
        }
        this.map.events.on({
            move: this.move,
            zoomend: this.zoomEnd,
            addlayer: this.addLayer,
            removelayer: this.removeLayer,
            scope: this
        });
    },
    
    /**
     * Method: move
     * Handles the map's move event
     */
    move: function() {
        this.updateTimeout(this.moveDelay);
    },
    
    /**
     * Method: zoomEnd
     * Handles the map's zoomEnd event
     */
    zoomEnd: function() {
        this.updateTimeout(this.zoomDelay);
    },
    
    /**
     * Method: addLayer
     * Handles the map's addlayer event
     *
     * Parameters:
     * evt - {Object} The listener argument
     */
    addLayer: function(evt) {
        var layer = evt.layer;
        if (layer instanceof OpenLayers.Layer.Grid) {
            layer.events.on({
                addtile: this.addTile,
                retile: this.clearTileQueue,
                removetile: this.removeTile,
                scope: this
            });
            if (layer.grid) {
                var i, j, tile;
                for (i=layer.grid.length-1; i>=0; --i) {
                    for (j=layer.grid[i].length-1; j>=0; --j) {
                        tile = layer.grid[i][j];
                        this.addTile({tile: tile});
                        if (tile.url) {
                            this.manageTileCache({object: tile});
                        }
                    }
                }
            }
        }
    },
    
    removeLayer: function(evt) {
        if (evt.layer instanceof OpenLayers.Layer.Grid) {
            this.clearTileQueue(evt);
        }
    },
    
    updateTimeout: function(delay) {
        window.clearTimeout(this.tileQueueId);
        if (this.tileQueue.length) {
            this.tileQueueId = window.setTimeout(
                OpenLayers.Function.bind(this.drawTilesFromQueue, this),
                delay
            );
        }
    },
    
    addTile: function(evt) {
        evt.tile.events.on({
            beforedraw: this.queueTileDraw,
            loadstart: this.manageTileCache,
            scope: this
        });        
    },
    
    removeTile: function(evt) {
        evt.tile.events.un({
            beforedraw: this.queueTileDraw,
            loadstart: this.manageTileCache,
            scope: this
        });
        OpenLayers.Util.removeItem(this.tileQueue, evt.tile);
    },
    
    /**
     * Method: queueTileDraw
     * Adds a tile to the queue that will draw it.
     *
     * Parameters:
     * evt - {Object} Listener argument of the tile's beforedraw event
     */
    queueTileDraw: function(evt) {
        var tile = evt.object;
        var queued = false;
        var layer = tile.layer;
        // queue only if image with same url not cached already
        if (layer.url && (layer.async ||
                                  !this.tileCache[layer.getURL(tile.bounds)])) {
            // add to queue only if not in queue already
            if (!~OpenLayers.Util.indexOf(this.tileQueue, tile)) {
                this.tileQueue.push(tile);
            }
            queued = true;
        }
        return !queued;
    },
    
    /**
     * Method: drawTilesFromQueue
     * Draws tiles from the tileQueue, and unqueues the tiles
     */
    drawTilesFromQueue: function() {
        while (this.tileQueue.length) {
            this.tileQueue.shift().draw(true);
        }
    },
    
    /**
     * Method: manageTileCache
     * Adds, updates, removes and fetches cache entries.
     *
     * Parameters:
     * evt - {Object} Listener argument of the tile's loadstart event
     */
    manageTileCache: function(evt) {
        var tile = evt.object;
        if (this.tileCache[tile.url]) {
            tile.imgDiv = this.tileCache[tile.url];
            OpenLayers.Util.removeItem(this.tileCacheIndex, tile.url);
            this.tileCacheIndex.push(tile.url);
            tile.positionTile();
            tile.layer.div.appendChild(tile.imgDiv);
        } else {
            tile.events.register('loadend', this, function loadend() {
                tile.events.unregister('loadend', this, loadend);
                if (!this.tileCache[tile.url]) {
                    if (this.tileCacheIndex.length >= this.tileCacheSize) {
                        delete this.tileCache[this.tileCacheIndex[0]];
                        this.tileCacheIndex.shift();
                    }
                    if (!OpenLayers.Element.hasClass(
                                             tile.imgDiv, 'olImageLoadError')) {
                        this.tileCache[tile.url] = tile.imgDiv;
                        this.tileCacheIndex.push(tile.url);
                    }
                }
            });
        }
    },
    
    /**
     * Method: clearTileQueue
     * Clears the tile queue from tiles of a specific layer
     *
     * Parameters:
     * evt - {Object} Listener argument of the layer's retile event
     */
    clearTileQueue: function(evt) {
        var layer = evt.object;
        for (var i=this.tileQueue.length-1; i>=0; --i) {
            if (this.tileQueue[i].layer === layer) {
                this.tileQueue.splice(i, 1);
            }
        }
    }

});