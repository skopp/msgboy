var _ = require('underscore');
var Backbone = require('backbone');
var Redis = require("redis");

var flatten,
__hasProp = Object.prototype.hasOwnProperty;

flatten = function(obj, into, prefix, sep) {
    var key, prop;
    if (into == null) into = {};
    if (prefix == null) prefix = '';
    if (sep == null) sep = '_';
    for (key in obj) {
        if (!__hasProp.call(obj, key)) continue;
        prop = obj[key];
        if (typeof prop === 'object' && !(prop instanceof Date) && !(prop instanceof RegExp)) {
            flatten(prop, into, prefix + key + sep, sep);
        } else {
            into[prefix + key] = prop;
        }
    }
    return into;
};

var unflatten,
__hasProp = Object.prototype.hasOwnProperty;

unflatten = function(obj, into, sep) {
    var key, prop, sub, subKey, subKeys, _i, _len, _ref;
    if (into == null) into = {};
    if (sep == null) sep = '_';
    for (key in obj) {
        if (!__hasProp.call(obj, key)) continue;
        prop = obj[key];
        subKeys = key.split(sep);
        sub = into;
        _ref = subKeys.slice(0, -1);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            subKey = _ref[_i];
            sub = (sub[subKey] || (sub[subKey] = {}));
        }
        sub[subKeys.pop()] = prop;
    }
    return into;
};

// Generate four random hex digits.
function S4() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

// Generate a pseudo-GUID by concatenating random hexadecimal.
function guid() {
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

// Driver object
function Driver() {}

function debugLog(str) {
    if (typeof window.console !== "undefined" && typeof window.console.log !== "undefined") {
        window.console.log(str);
    }
}

// Driver Prototype
Driver.prototype = {

    // Performs all the migrations to reach the right version of the database
    migrate: function (db, migrations, version, options) {
        debugLog("Starting migrations from " + version);
        this._migrate_next(db, migrations, version, options);
    },

    // Performs the next migrations. This method is private and should probably not be called.
    _migrate_next: function (db, migrations, version, options) {
        var that = this;
        var migration = migrations.shift();
        if (migration) {
            if (!version || version < migration.version) {
                // We need to apply this migration-
                if (typeof migration.before == "undefined") {
                    migration.before = function (db, next) {
                        next();
                    };
                }
                if (typeof migration.after == "undefined") {
                    migration.after = function (db, next) {
                        next();
                    };
                }
                // First, let's run the before script
                migration.before(db, function () {
                    var versionRequest = db.setVersion(migration.version);
                    versionRequest.onsuccess = function (e) {
                        migration.migrate(db, versionRequest, function () {
                            // Migration successfully appliedn let's go to the next one!
                            migration.after(db, function () {
                                debugLog("Migrated to " + migration.version);
                                that._migrate_next(db, migrations, version, options);
                            });
                        });
                    };
                });
            } else {
                // No need to apply this migration
                debugLog("Skipping migration " + migration.version);
                this._migrate_next(db, migrations, version, options);
            }
        } else {
            debugLog("Done migrating");
            // No more migration
            options.success();
        }
    },

    /* This is the main method. */
    execute: function (db, storeName, method, object, options) {
        switch (method) {
            case "create":
            this.write(db, storeName, object, options);
            break;
            case "read":
            if (object instanceof Backbone.Collection) {
                this.query(db, storeName, object, options); // It's a collection
            } else {
                this.read(db, storeName, object, options); // It's a Model
            }
            break;
            case "update":
            this.write(db, storeName, object, options); // We may want to check that this is not a collection
            break;
            case "delete":
            this.delete(db, storeName, object, options); // We may want to check that this is not a collection
            break;
            default:
            // Hum what?
        }
    },

    // Writes the json to the storeName in db.
    // options are just success and error callbacks.
    write: function (db, storeName, object, options) {
        var json = flatten(object.toJSON());
        if (!json.id) json.id = guid();
        db.hmset(storeName + ":" + json.id, json, function(error, object) {
            if(error) {
                options.error(e);
            }
            else {
                options.success(json);
            }
        })
    },

    // Reads from storeName in db with json.id if it's there of with any json.xxxx as long as xxx is an index in storeName 
    read: function (db, storeName, object, options) {
        var json = object.toJSON();

        db.hgetall(storeName + ":" + json.id, function(error, object) {
            if(error) {
                options.error("Not Found");
            }
            else if(object && !_.isEmpty(object)) {
                options.success(unflatten(object));
            }
            else {
                options.error("Not Found");
            }
        });
    },

    // Deletes the json.id key and value in storeName from db.
    delete: function (db, storeName, object, options) {
        var deleteTransaction = db.transaction([storeName], IDBTransaction.READ_WRITE);
        var store = deleteTransaction.objectStore(storeName);
        var json = object.toJSON();

        var deleteRequest = store.delete(json.id);
        deleteRequest.onsuccess = function (event) {
            options.success(null);
        };
        deleteRequest.onerror = function (event) {
            options.error("Not Deleted");
        };
    },

    // Performs a query on storeName in db.
    // options may include :
    // - conditions : value of an index, or range for an index
    // - range : range for the primary key
    // - limit : max number of elements to be yielded
    // - offset : skipped items.
    query: function (db, storeName, collection, options) {
        var elements = [];
        var skipped = 0, processed = 0;
        var queryTransaction = db.transaction([storeName], IDBTransaction.READ_ONLY);
        var readCursor = null;
        var store = queryTransaction.objectStore(storeName);
        var index = null,
        lower = null,
        upper = null,
        bounds = null;

        if (options.conditions) {
            // We have a condition, we need to use it for the cursor
            _.each(store.indexNames, function (key) {
                if (!readCursor) {
                    index = store.index(key);
                    if (options.conditions[index.keyPath] instanceof Array) {
                        lower = options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1] ? options.conditions[index.keyPath][1] : options.conditions[index.keyPath][0];
                        upper = options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1] ? options.conditions[index.keyPath][0] : options.conditions[index.keyPath][1];
                        bounds = IDBKeyRange.bound(lower, upper, true, true);

                        if (options.conditions[index.keyPath][0] > options.conditions[index.keyPath][1]) {
                            // Looks like we want the DESC order
                            readCursor = index.openCursor(bounds, 2);
                        } else {
                            // We want ASC order
                            readCursor = index.openCursor(bounds, 0);
                        }
                    } else if (options.conditions[index.keyPath]) {
                        bounds = IDBKeyRange.only(options.conditions[index.keyPath]);
                        readCursor = index.openCursor(bounds);
                    }
                }
            });
        } else {
            // No conditions, use the index
            if (options.range) {
                lower = options.range[0] > options.range[1] ? options.range[1] : options.range[0];
                upper = options.range[0] > options.range[1] ? options.range[0] : options.range[1];
                bounds = IDBKeyRange.bound(lower, upper);
                if (options.range[0] > options.range[1]) {
                    readCursor = store.openCursor(bounds, 2);
                } else {
                    readCursor = store.openCursor(bounds, 0);
                }
            } else {
                readCursor = store.openCursor();
            }
        }

        if (typeof (readCursor) == "undefined" || !readCursor) {
            options.error("No Cursor");
        } else {
            // Setup a handler for the cursor’s `success` event:
            readCursor.onsuccess = function (e) {
                var cursor = e.target.result;
                if (!cursor) {
                    if (options.addIndividually || options.clear) {
                        // nothing!
                        // We need to indicate that we're done. But, how?
                        collection.trigger("reset");
                    } else {
                        options.success(elements); // We're done. No more elements.
                    }
                }
                else {
                    // Cursor is not over yet.
                    if (options.limit && processed >= options.limit) {
                        // Yet, we have processed enough elements. So, let's just skip.
                        if (bounds && options.conditions[index.keyPath]) {
                            cursor.continue(options.conditions[index.keyPath][1] + 1); /* We need to 'terminate' the cursor cleany, by moving to the end */
                        } else {
                            cursor.continue(); /* We need to 'terminate' the cursor cleany, by moving to the end */
                        }
                    }
                    else if (options.offset && options.offset > skipped) {
                        skipped++;
                        cursor.continue(options.offset - skipped); /* We need to Moving the cursor forward */
                    } else {
                        // This time, it looks like it's good!
                        processed++;
                        if (options.addIndividually) {
                            collection.add(cursor.value);
                        } else if (options.clear) {
                            var deleteRequest = store.delete(cursor.value.id);
                            deleteRequest.onsuccess = function (event) {
                                elements.push(cursor.value);
                            };
                            deleteRequest.onerror = function (event) {
                                elements.push(cursor.value);
                            };

                        } else {
                            elements.push(cursor.value);
                        }
                        cursor.continue(); 
                    }
                }
            };
        }
    }
};


// Keeps track of the connections
var Connections = {};

// ExecutionQueue object
function ExecutionQueue(driver, database) {
    this.driver = driver;
    this.database = database
    this.started = false;
    this.stack = [];
    this.connection = Redis.createClient();

    this.error = null;
    this.ready();

}

// ExecutionQueue Prototype
ExecutionQueue.prototype = {

    ready: function () {
        this.started = true;
        _.each(this.stack, function (message) {
            this.execute(message);
        }.bind(this));
    },

    execute: function (message) {
        if (this.error) {
            message[2].error(this.error);
        } else {
            if (this.started) {
                this.driver.execute(this.connection, message[1].storeName, message[0], message[1], message[2]); // Upon messages, we execute the query
            } else {
                this.stack.push(message);
            }
        }
    }

};

exports.sync = function (method, object, options) {
    var database = object.database;
    var driver = new Driver();

    if (!Connections[database.id]) {
        Connections[database.id] = new ExecutionQueue(driver, database);
    }
    Connections[database.id].execute([method, object, options]);
};
