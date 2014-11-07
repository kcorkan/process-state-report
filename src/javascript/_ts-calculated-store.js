Ext.define('Rally.technicalservices.data.Timepoint',{
	startDate: '',
	endDate: '',
	fieldValue: '',
	constructor: function(config){
		Ext.apply(this,config);
	},	
	getDurationInHours: function(){
		//TODO Verify dates are valid
		console.log('getDurationInHours',this.startDate,this.endDate);
	    var ms = Ext.Date.getElapsed(new Date(this.startDate),new Date(this.endDate));
	    var hours = 0;
	    if (ms > 0) {
	    	hours = Math.max(1, Math.round(ms/1000/3600));
	    }
 	    return hours;
	},
	getDurationInDays: function(){
		console.log('getDurationInDays', this);
		var hours = this.getDurationInHours();
		console.log('hours',hours);
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
		console.log('setData',record.get('FormattedID'));
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
		console.log('addTimepoint',tp_val,tp_startDate,tp_endDate);
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
		console.log('getage',regex, this.timepoints);
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
		console.log('getLastTransitionStartDate');
		var regex = new RegExp(state,"i"); //case insensitive
		var last_start_date = "N/A";
		Ext.each(this.timepoints, function(tp){
			var match = tp.fieldValue.toString().match(regex);
			if (match != null && tp.fieldValue.toString() == match[0]){
				last_start_date = tp.startDate;
			}
		},this);
		console.log('getLastTransitionStartDate', last_start_date);
		return last_start_date;  
	}
});

Ext.define('Rally.technicalservices.data.CalculatedStore',{
    logger: new Rally.technicalservices.Logger(),
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
	constructor: function(config){
		Ext.apply(this,config);
	},
	load: function(action){
		var deferred = Ext.create('Deft.Deferred');
		this.maxTimepoints = 0;
		this._fetchLookbackStore('HierarchicalRequirement',this.currentProjectId).then({
				scope: this,
				success: function(data){
					var tl_hash = this._mungeLookbackDataIntoTimelineHash(data);

					if (this[action]){
						var flattened_data = this[action](tl_hash);
						deferred.resolve(flattened_data);
					} else {
						deferred.reject("Invalid Action:" + action);
					}
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

    _fetchLookbackStore:function(model_name, current_project_id){
    	this.logger.log('_fetchLookbackStore',model_name,this.timelineField,current_project_id);
    	var deferred = Ext.create('Deft.Deferred');
    	
    	var previous_field_name = Ext.String.format("_PreviousValues.{0}",this.timelineField); 
    	var fetch_fields = ['FormattedID','Name','_ValidFrom','_ValidTo','CreationDate',this.timelineField];
    	var fetch_hydrate = [];
    	if (this.timelineField == "ScheduleState" || this.timelineField == "State"){
    		fetch_hydrate.push(this.timelineField);
    	}

    	Ext.create('Rally.data.lookback.SnapshotStore', {
            scope: this,
            listeners: {
                scope: this,
                load: function(store, data, success){
                    this.logger.log('fetchLookbackStore returned data',data);
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
	_mungeLookbackDataIntoTimelineHash: function(data){
    	
		var timeline_hash = {};

		Ext.each(data, function(d){

    		var formatted_id = d.get('FormattedID');
    		if (timeline_hash[formatted_id] == undefined){
    			timeline_hash[formatted_id] = Ext.create('Rally.technicalservices.data.Timeline',{
    				timelineField: this.timelineField,
     			});
    			timeline_hash[formatted_id].setData(d);
    		} else {
    			timeline_hash[formatted_id].addTimepoint(d);
    		}
    		var num_tp = timeline_hash[formatted_id].getNumTransitions();
    		if (num_tp > this.maxTimepoints){
    			this.maxTimepoints = num_tp;
    			console.log('maxtp',this.maxTimepoints);
    		}
    	}, this);
		return timeline_hash;
	},

	getFlattenedCumulativeAgeData: function(tl_hash){
		this.logger.log('getFlattenedCumulativeAgeData', tl_hash);
		//Returns an array of data that can be plopped into a custom store or exported.  
    	var data = [];
    	var tl_states = this.timelineStates;
    	Object.keys(tl_hash).forEach(function(key) { 
    		//Calculate State Age
    		var tl = tl_hash[key];
   			var row = tl.timelineData

   			//Initialize the row headers
    		Ext.each(tl_states, function(state){
    			row[state] = tl.getCumulativeAgeInDays(state);
    			console.log('state and age', state, row[state]);
    		}, this);
   			row['Transitions'] = tl.timepoints.length
  		data.push(row);
    	});
    	return data; 
	},

	getFlattenedLastTransitionStartDateData: function(tl_hash){
		this.logger.log('getFlattenedLastTransitionStartDateData', tl_hash);
		var data = [];
    	var tl_states = this.timelineStates;
    	Object.keys(tl_hash).forEach(function(key) { 
    		//Calculate State Age
    		var tl = tl_hash[key];
   			var row = tl.timelineData

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
   			var row = tl.timelineData
   			console.log(key, tl);
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
		}
	}
});

