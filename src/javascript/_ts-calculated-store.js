Ext.define('Rally.technicalservices.data.Timepoint',{
	startDate: '',
	endDate: '',
	fieldValue: '',
	constructor: function(config){
		Ext.apply(this,config);
	},	
	getDurationInHours: function(){
		//TODO Verify dates are valid
	    var ms = Ext.Date.getElapsed(new Date(this.startDate),new Date(this.endDate));
	    var hours = 0;
	    if (ms > 0) {
	    	hours = Math.max(1, Math.round(ms/1000/3600));
	    }
 	    return hours;
	},
	getDurationInDays: function(){
		var hours = this.getDurationInHours();
		if (hours > 0) {
			return hours/24;
		}
		return 0;
	}
});

Ext.define('Rally.technicalservices.data.Timeline',{
	timelineData: null, 
	timelineField: '',
	timepoints: null,
	constructor: function(config){
		Ext.apply(this,config);
	},
	setData: function(record){
		Ext.each(record.getFields(), function(f){
			if (f.name != "_id" && f.name != "_ValidTo" && f.name != "_ValidFrom"){
				if (f.name != this.timelineField){
					this.set(f.name,record.get(f.name));
				} else {
					this.addTimepoint(record);
				}
			}
		},this);
	},
	getHydratedData: function(wsapiHydratedFields, wsapiHydratedValues,onlyIncludeFields){
		var hydrated_fields = Object.keys(wsapiHydratedFields);
		var data = {};
		Ext.each(Object.keys(this.timelineData), function(key){
			var bInclude = true; 
			if (onlyIncludeFields && onlyIncludeFields.length > 0){
				bInclude = Ext.Array.contains(onlyIncludeFields, key);
			}
			
			if (bInclude){
				var val = this.timelineData[key];
				if (bInclude && val && val != '' && Ext.Array.contains(hydrated_fields,key)){
					var wsapi_value_key = wsapiHydratedFields[key];
					var new_val = wsapiHydratedValues[wsapi_value_key][val.toString()];
					if (new_val){
						val = new_val;
					}
				}
				data[key] = val;
			}
		},this);
		return data;
	},
	set: function(field, value){
		if (this.timelineData == null) {
			this.timelineData = {};
		}
		this.timelineData[field] = value;
	},
	get: function(field){
		if (this.timelineData == null){
			this.timelineData = {};
		}
		return this.timelineData[field];
	},
	addTimepoint: function(record){
		//Add timepoint to the appropriate place in the array (sort by date ascending)
		if (this.timepoints == null) {
			this.timepoints = [];
		}
		var tp_val = record.get(this.timelineField);
		var tp_startDate = new Date(record.get('_ValidFrom'));
		var tp_endDate = new Date();
		
		//TODO calculate end date based on next start date
		var tp = Ext.create('Rally.technicalservices.data.Timepoint',{
			fieldValue: tp_val,
			startDate: tp_startDate,
			endDate: tp_endDate
		});
		
		var i = 0;
		for (i=0; i< this.timepoints.length; i++){
			if (tp.startDate < this.timepoints[i].startDate){
				tp.endDate = this.timepoints[i].startDate;
				if (i > 0){
					this.timepoints[i-1].endDate = tp.startDate;  
				}
				break; 
			} 
		}

		if (i == this.timepoints.length && i > 0){
			this.timepoints[i-1].endDate = tp.startDate; 
		}
		this.timepoints.splice(i,0,tp);

	},
	getCumulativeAgeInDays: function(val){
		//TODO check if val is number or string
		var regex = new RegExp(val,"i"); //case insensitive
		var age = 0; 
		Ext.each(this.timepoints, function(tp){
			var match = tp.fieldValue.toString().match(regex);
			if (match != null && tp.fieldValue.toString() == match[0]){
				age += tp.getDurationInDays();
			}
		}, this);
		return age;
	},
	getNumTransitions: function(){
		if (this.timepoints == null) {
			this.timepoints = [];
		}
		return this.timepoints.length;
	},
	getLastTransitionStartDate: function(state){
		var regex = new RegExp(state,"i"); //case insensitive
		var last_start_date = "N/A";
		Ext.each(this.timepoints, function(tp){
			var match = tp.fieldValue.toString().match(regex);
			if (match != null && tp.fieldValue.toString() == match[0]){
				last_start_date = tp.startDate;
			}
		},this);
		return last_start_date;  
	}
});

Ext.define('Rally.technicalservices.data.CalculatedStore',{
    logger: new Rally.technicalservices.Logger(),
	MAX_CHUNK_SIZE: 25,
	wsapiHydratedFields:  {
		    'Project':'Project',
			'Iteration':'Iteration',
			'Feature':'PortfolioItem/Feature',
			'Owner':'User',
			'SubmittedBy':'User',
			'Release':'Release'},

	/*
	 * sourceFields: fields to fetch from the store
	 */
	sourceFields: null,
	/*
	 * outputFields: fields that we want to display or report on
	 */
	outputFields: null,
	/*
	 * calculations: what calculations options are:
	 * 		-- timeline
	 */
	timelineField: '',
	timelineStates: null,
	currentProjectId: 0,
	timelineHash: null,
	maxTimepoints: 0,
	rallyType: 'HierarchicalRequirement',
	fetchFields: '',
	
	constructor: function(config){
		Ext.apply(this,config);
	},
	
	load: function(action){
		var deferred = Ext.create('Deft.Deferred');
		this.maxTimepoints = 0;
		this._fetchLookbackStore(this.rallyType,this.currentProjectId).then({
				scope: this,
				success: function(data){
					var tl_hash = this._mungeLookbackDataIntoTimelineHash(data);
			    	this._getWsapiHydratedValues().then({
			    		scope: this,
			    		success: function(){

							if (this[action]){
								var flattened_data = this[action](tl_hash);
								deferred.resolve(flattened_data);
							} else {
								deferred.reject("Invalid Action:" + action);
							}
			    		},
			    		failure: function(error){
			    			alert('Error Hydrating WSAPI values: ' + error);
			    		}
			    	});

				},
				failure: function(error){
					deferred.reject(error);
					alert(error);
				}
		});
		return deferred.promise;
	},
	
	initConfigs: function(){
		if (this.sourceFields == null) {
			this.sourceFields = [];	
		}
		if (this.outputFields == null) {
			this.outputFields = [];
		}
		if (this.timelineStates == null) {
			this.timelineStates = [];
		}
	},
	
	_getFetchFields: function(){
		var fetch_fields = Ext.Array.merge(this.fetchFields, [this.timelineField]);
		console.log ('fetch fields',fetch_fields);
		return fetch_fields;
	},
	
	_getHydrateFields: function(){
		var hydrated_fields = ['ScheduleState','State'];
		var fetch_hydrate = [];
    	Ext.each(this._getFetchFields(), function(field){
    		if (Ext.Array.contains(hydrated_fields, field)){
    			fetch_hydrate.push(field);
    		}
    	},this);
    	return fetch_hydrate;
	},
	
    _fetchLookbackStore:function(model_name, current_project_id){
    	this.logger.log('_fetchLookbackStore',model_name,this.timelineField,current_project_id);
    	var deferred = Ext.create('Deft.Deferred');
    	
    	var previous_field_name = Ext.String.format("_PreviousValues.{0}",this.timelineField); 
    	var fetch_fields = this._getFetchFields();
    	var fetch_hydrate = this._getHydrateFields();
    	this.logger.log('_fetchLookbackStore', previous_field_name, fetch_fields, fetch_hydrate);
    	Ext.create('Rally.data.lookback.SnapshotStore', {
            scope: this,
            listeners: {
                scope: this,
                load: function(store, data, success){
                    this.logger.log('fetchLookbackStore returned data',success, data);
                    deferred.resolve(data);
                }
            },
            autoLoad: true,
            fetch: fetch_fields,
            hydrate: fetch_hydrate,
            filters: [{
            	property: "_TypeHierarchy",
            	value: model_name
            },{
            	property: previous_field_name,
            	value: {$exists: true}
            },{
            	property: "_ProjectHierarchy",
            	value: current_project_id
            }],
            sort: {"_ValidFrom":-1}
       });         
    return deferred.promise;
    },
    _addToWsapiHydratedValues: function(rec){
		this.logger.log('_addToWsapiHydratedValues', rec);
    	Ext.each(Object.keys(this.wsapiHydratedFields), function(f){
    		this.logger.log('_addToWsapiHydratedValues key', f);
   		
			if (rec.get(f)){
				var obj_type = this.wsapiHydratedFields[f];
	    		this.logger.log('_addToWsapiHydratedValues obj_type', obj_type);

				if (this.wsapiHydratedValues[obj_type] == undefined){
					this.wsapiHydratedValues[obj_type]={};
				} 
				if (this.wsapiHydratedValues[obj_type][rec.get(f).toString()] == undefined) {
					this.wsapiHydratedValues[obj_type][rec.get(f).toString()] = rec.get(f);
				}
			}
		},this);
    },
	_getWsapiHydratedValues: function(){
		this.logger.log('_getWsapiHydratedValues', this.wsapiHydratedValues);
		var deferred = Ext.create('Deft.Deferred');
		
		var queries = Object.keys(this.wsapiHydratedValues);
        var promises = [];
        
        Ext.each(queries, function(q){
			var values = Object.keys(this.wsapiHydratedValues[q]);
			var values_to_hydrate = [];
			Ext.each(values, function(v){
				if (this.wsapiHydratedValues[q][v].toString() == this.wsapiHydratedValues[q][v].toString()){
					values_to_hydrate.push(v);
				}
			},this);
			
			/*
			 * Set the field to hydrate
			 */
			var hydrate_field = 'Name';
			if (q == 'User'){
				hydrate_field = 'DisplayName';
			}
			this.logger.log('_getWsapiHydratedValues: Hydrating',q,values_to_hydrate.length, values_to_hydrate,hydrate_field);

			if (values_to_hydrate.length > this.MAX_CHUNK_SIZE){
				var start_idx = 0;
				console.log('original array',values_to_hydrate);
				while(start_idx < values_to_hydrate.length){
					chunk_values = values_to_hydrate.splice(start_idx, this.MAX_CHUNK_SIZE);
					promises.push(this._loadWsapiStore(q,chunk_values,hydrate_field));
				}

			} else {
	            promises.push(this._loadWsapiStore(q,values_to_hydrate,hydrate_field));
			}
		},this);
        
        if (promises.length == 0){
        	deferred.resolve();
        }
		Deft.Promise.all(promises).then({
            scope: this,
            success: function(objects) {
                Ext.each(objects, function(o){
                    var obj = o[0];
                    var obj_data = o[1];
                    var obj_hydrate_field = o[2];
                 	if (obj_data.length > 0){
                    	Ext.each(obj_data, function(d){
                    		console.log(obj_hydrate_field, d.get('ObjectID').toString(),d.get(obj_hydrate_field));
                    		this.wsapiHydratedValues[obj][d.get('ObjectID').toString()] = d.get(obj_hydrate_field);
                    	},this);
                    }
                },this);
                 deferred.resolve();
           },
           failure: function(){
        	   deferred.reject('Error hydrating wsapi fields');
           }
        });
		return deferred; 
	},
	_loadWsapiStore: function(object_type,object_ids,hydrate_field){
		this.logger.log('_loadWsapiStore',object_type,hydrate_field,object_ids);
		var deferred = Ext.create('Deft.Deferred');
		
		var filter = null;
		Ext.each(object_ids, function(oid){
			if (filter == null){
				filter = Ext.create('Rally.data.wsapi.Filter', {
				     property: 'ObjectID',
				     value: oid
				});
			} else {
				filter = filter.or(Ext.create('Rally.data.wsapi.Filter', {
				     property: 'ObjectID',
				     value: oid}));
			}
		},this);
		
		Ext.create('Rally.data.wsapi.Store', {
		    model: object_type,
		    filters: filter,
		    autoLoad: true,
		    context: {project: null},
		    listeners: {
		        load: function(store, data, success) {
		            if (success){
			        	deferred.resolve([object_type, data, hydrate_field]);
		            } else {
		            	deferred.resolve([object_type, [], hydrate_field]);
		            }
		        }
		    },
		    fetch: ['ObjectID',hydrate_field]
		});
		
		return deferred.promise; 
	},
	_mungeLookbackDataIntoTimelineHash: function(data){
    	
		var timeline_hash = {};
		this.wsapiHydratedValues = {};
		Ext.each(data, function(d){

    		var formatted_id = d.get('FormattedID');
    		if (timeline_hash[formatted_id] == undefined){
    			timeline_hash[formatted_id] = Ext.create('Rally.technicalservices.data.Timeline',{
    				timelineField: this.timelineField,
     			});
    			
    			timeline_hash[formatted_id].setData(d);
    			this._addToWsapiHydratedValues(d);
    		} else {
    			timeline_hash[formatted_id].addTimepoint(d);
    		}
    		var num_tp = timeline_hash[formatted_id].getNumTransitions();
    		if (num_tp > this.maxTimepoints){
    			this.maxTimepoints = num_tp;
    		}
    	}, this);
		this.logger.log('_mungeLookbackDataIntoTimelineHash records',Object.keys(timeline_hash).length);
		return timeline_hash;
	},

	getFlattenedCumulativeAgeData: function(tl_hash){
		this.logger.log('getFlattenedCumulativeAgeData', tl_hash);
		//Returns an array of data that can be plopped into a custom store or exported.  
    	var data = [];
    	 
    	var tl_states = this.timelineStates;
    	Ext.each(Object.keys(tl_hash), function(key) { 
    		//Calculate State Age
    		var tl = tl_hash[key];
   			//var row = tl.timelineData
    		
    		var row = tl.getHydratedData(this.wsapiHydratedFields, this.wsapiHydratedValues, this.fetchFields);
    		
   			//Initialize the row headers
    		Ext.each(tl_states, function(state){
    			row[state] = tl.getCumulativeAgeInDays(state);
    		}, this);
   			row['Transitions'] = tl.timepoints.length
   			data.push(row);
    	},this);
    	return data; 
	},

	getFlattenedLastTransitionStartDateData: function(tl_hash){
		this.logger.log('getFlattenedLastTransitionStartDateData', tl_hash);
		var data = [];
    	var tl_states = this.timelineStates;
		    	Object.keys(tl_hash).forEach(function(key) { 
		    		//Calculate State Age
		    		var tl = tl_hash[key];
		   //			var row = tl.timelineData
		    		var row = tl.getHydratedData(this.wsapiHydratedFields, this.wsapiHydratedValues, this.fetchFields);
		
		   			//Initialize the row headers
		    		Ext.each(tl_states, function(state){    			
		    			row[state] = tl.getLastTransitionStartDate(state);
		    		}, this);
		   			row['Transitions'] = tl.getNumTransitions();
		  		data.push(row);
		    	});
		    	return data; 
	},

	getFlattenedComprehensiveData: function(tl_hash){
		this.logger.log('getFlattenedComprehensiveData',tl_hash);
		var data = [];
    	var tl_states = this.timelineStates;
    	var max_timepoints = this.maxTimepoints;
    	Object.keys(tl_hash).forEach(function(key) { 

    		var tl = tl_hash[key];
//   			var row = tl.timelineData
    		var row = tl.getHydratedData(this.wsapiHydratedFields, this.wsapiHydratedValues, this.fetchFields);
   			//Initialize the row headers
   			var counter = 0;

   			if (tl.timepoints != null){
   	    		for (var i=0; i < max_timepoints; i++){
   	    			var index_date = 'StartDate' + i.toString();  
   	    			var index_state = 'State' + i.toString(); 
   	    			var index_end_date = 'EndDate' + i.toString();
   	    			row[index_state] = '';
  	    			row[index_date] = '';
   	    			row[index_end_date] = '';
   	    			if (i < tl.timepoints.length){
   	   	    			var tp = tl.timepoints[i]
   	   	    			row[index_state] = tp.fieldValue.toString();
   	   	    			row[index_date] = tp.startDate;
   	   	    			row[index_end_date] = tp.endDate;
   	    			} 
                }
            }
            data.push(row);
        });
        return data; 
     },
    statics: {
        getViewStore: function(){
            return Ext.create('Rally.data.custom.Store', {
                 data: [
                       {name:'Cumulative Age', operation:'getFlattenedCumulativeAgeData'},
                       {name:'Last Transition Date', operation:'getFlattenedLastTransitionStartDateData'}, 
                       {name:'Comprehensive View', operation:'getFlattenedComprehensiveData'}
                       ],
                 autoLoad: true
            });
        },
        getFilterOperators: function(fieldName){
           if (fieldName && fieldName.match(/StartDate/)){
                return [{'OperatorName':'>'},{'OperatorName':'<'}];
            }
            if (fieldName && fieldName.match(/EndDate/)){
                return [{'OperatorName':'>'},{'OperatorName':'<'}];
            }
            if (fieldName && fieldName.match(/State/)){
                return [{'OperatorName':'='},{'OperatorName':'contains'}];
            }
            return [{'OperatorName':'='},{'OperatorName':'>'},{'OperatorName':'<'}];
		}
	}
});

