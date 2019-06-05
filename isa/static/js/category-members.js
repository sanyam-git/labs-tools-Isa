// Finds all images from a set of categories with depth passed to the getImages function
// processCategory is the main function which runs recursively for each category/subcategory found
// Each category tree is found asnychronously
// Individual steps for each tree are synchronous as previous data is needed for each next step

var CategoryMembers = (function (exports) {
    
    var imagesInCategories = []; // Final image list
    var processedCategories = []; // Prevent infinite loops
    var userCancelled = false; // todo: setup user cancel in loading dialogue box
    
    var CONSTANTS = {
        BASE_REQUEST_DATA: {
            action: 'query',
            format: 'json',
            list: 'categorymembers',
            cmlimit: 'max',
            cmnamespace: '6|14',
            cmprop: 'title|type',
            origin: '*'
        },
        AJAX_SETTINGS: {
            url: "https://commons.wikimedia.org/w/api.php",
            type: 'GET',
        }
    };
    
    function withContinue(data, continueValue) {
        data["cmcontinue"] = continueValue;
        return data;
    }

    function makeApiRequest(requestData, continueValue, results, deferredResult) {
        var settings = $.extend({ data: withContinue(requestData, continueValue) }, CONSTANTS.AJAX_SETTINGS);

        $.ajax(settings)
            .done(function (data) {
                if (data && data.error) {
                    alert('Something went wrong while processing categories:\n' + data.error.info);
                    deferredResult.reject();
                    return;
                }

                var pages = data.query.categorymembers;

                results = results.concat(pages);

                var continueValue = getContinueValue(data);
                if (continueValue) {
                    makeApiRequest(requestData, continueValue, results, deferredResult);
                } else {
                    deferredResult.resolve(results);
                }
        });
    }

    function getContinueValue(data) {
        if (data.continue && data.continue.cmcontinue) return data.continue.cmcontinue;
    }

    function getCategoryAjaxData(category) {
        return $.extend({ cmtitle: category }, CONSTANTS.BASE_REQUEST_DATA);
    }

    function getPagesFor(category) {
        var results = [],
            deferredResult = $.Deferred();
        makeApiRequest(getCategoryAjaxData(category), "", results, deferredResult);

        return deferredResult.promise();
    };
    
    function getPagesForTree(category, depth) {
        var treeDeferredResult = $.Deferred();
        processCategory(category, depth, function() { treeDeferredResult.resolve() })
        return treeDeferredResult.promise();
    };
    
    // Process individual main root category
    // Recursively calls itself for any subcategories found to specified depth
    // Automatically sends further continue queries for each category if limit has been reached
    // Aborts category if it's already been processed to avoid infinite loops in category tree
    function processCategory(category, depth, callback) {

        if (processedCategories.indexOf(category) != -1) {
            // Infinite category loop detected, do not process this category
            callback.call(window);
            return;
        }

        processedCategories.push(category); 

        getPagesFor(category)
            .done(function (members) {
                var subCategories = [];
                for (var i = 0; i < members.length; i++) {
                    var member = members[i];
                    // Files in category
                    if (member.type === "file") {
                        imagesInCategories.push(member.title);
                    }
                    // Subcategories in category
                    if (depth !== 0 && member.type === "subcat") {
                        subCategories.push(member.title);
                    }
                }

                if (depth === 0) {
                    // done
                    callback.call(window);
                    return;
                }

                var childrenToLoad = subCategories.length;
                if (childrenToLoad === 0) {
                    // done
                    callback.call(window);
                    return;
                }

                subCategories.forEach(function (subCategory) {
                    // Repeat for each child category
                    processCategory(subCategory, depth - 1, function () {
                        childrenToLoad--;
                        if (childrenToLoad <= 0) {
                            // done
                            callback.call(window);
                            return;
                        }
                    });
                }); // load next subCategory
            })
            .fail(function (xhr, err, msg) {
                // todo: close progress popup
                if (!userCancelled) {
                    alert('Something went wrong while processing categories:\n' + msg);
                }
            });
    }

    exports.getImages = function(campaignCategories, callback) {
        // Stores deferred object for each campaign category api call
        // Each one is resolved when the entire tree including depth is complete
        // callback is called once all have been resolved
        var deferredTreeCalls = [];
        for (var i=0; i<campaignCategories.length; i++) {
           deferredTreeCalls.push(getPagesForTree(campaignCategories[i].name, parseInt(campaignCategories[i].depth)));
        }

        $.when.apply(null, deferredTreeCalls)
            .then(function() {
                // All trees are complete, run callback on combined unique list
                var allowedExtensions = ["jpg", "jpeg", "png", "svg"];
                var images = uniqe(imagesInCategories).filter(function(filename) {
                    // only include filenames with supported extensions
                    var fileExtension = filename.split('.').pop().toLowerCase();
                    return allowedExtensions.includes(fileExtension);
            })
            callback(images)
            })
            .fail(function(err) {
            console.log("somthing went wrong processing category trees:\n" + err)
            })
    }
    
    // Get unique values from array
    function uniqe(array) {
        var seen = {};
        return array.filter(function (item) {
            return seen.hasOwnProperty(item) ? false : (seen[item] = true);
        });
    }
    return exports;
    
})(CategoryMembers || {});
