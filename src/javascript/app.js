Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {

    	this._addTypeSelector();
    },
    _addFieldSelector: function(cb){
    	this.logger.log('_addArtifactFieldSelector', cb);

    	if (this.down('#field-selector')){
        	this.down('#field-selector').destroy();
        }
    	
    	var model_type = cb.getValue();
    	var cb_field = this.down('#display_box').add({
        	xtype: 'rallyfieldcombobox',
            fieldLabel: 'Field type:',
            itemId: 'field-selector',
            model: model_type,
            listeners: {
                scope: this,
                change: this._generateReport
            }
        }); 
    	var field_store = cb_field.getStore();
    	field_store.on('load',this._filterDropDownList,this);
    },
    _addTypeSelector: function(){
        this.logger.log('_addTypeSelector');
        
    	var filters = Ext.create('Rally.data.wsapi.Filter',{
            property:'ElementName',
            value: 'HierarchicalRequirement'
        });
        filters = filters.or(Ext.create('Rally.data.wsapi.Filter',{
            property:'ElementName',
            value: 'Defect'
        }));
        filters = filters.or(Ext.create('Rally.data.wsapi.Filter',{
            property:'ElementName',
            operator: 'contains',
            value: 'Portfolio'
        }));
        
        this.down('#display_box').add({
            xtype: 'rallycombobox',
            displayField: 'DisplayName',
            fieldLabel: 'Artifact type:',
            valueField: 'TypePath',
            itemId: 'type-selector',
            stateId: 'artifact-type',
            stateful: true,
            stateEvents: ['change'],
            storeConfig: {
                autoLoad: true,
                model: 'TypeDefinition',
                filters: filters
            },
            listeners: {
                scope: this,
                change: this._addFieldSelector
            }
        }); 
    },
    _filterDropDownList: function(store,records) {
        store.filter([{
            filterFn:function(field){ 
                var valid = false;
                var field_def= field.get('fieldDefinition');
                if (!field_def.attributeDefinition){
                	return false;
                }
                if (field_def.attributeDefinition.ReadOnly == true){
                    return false;
                }
                if ( field_def.attributeDefinition.AllowedValues.length > 0) {
                	valid = true;
                }
                return valid;
            } 
        }]);
        //this.down('#field-selector').setValue(store.getAt(1));
    },
    _generateReport: function(cb){
    	this.logger.log('_generateReport', cb.getRecord());
    	
    	var process_states = [];
    	Ext.each(cb.getRecord().get('fieldDefinition').attributeDefinition.AllowedValues, function(av){
    		if (av.StringValue){
        		process_states.push(av.StringValue);
    		}
    	},this);
    	
    	this.logger.log('_generateReport process_states=', process_states);
    	var project_id = this.getContext().getProject().ObjectID; 
    	
    	field = cb.getRecord().get('fieldDefinition').name;  
    	model = this.down('#type-selector').value;
    	this._fetchLookbackStore(model, field, project_id).then({
    		scope: this,
    		success: function(data) {
    			this._buildCustomStore(data, field, process_states);
    		},
    		failure: this._alertError
    	});
    },
    _fetchLookbackStore:function(model_name, field_name, current_project_id){
    	this.logger.log('_fetchLookbackStore',model_name,field_name,current_project_id);
    	var deferred = Ext.create('Deft.Deferred');
    	
    	var previous_field_name = Ext.String.format("_PreviousValues.{0}",field_name); 
    	var fetch_fields = ['FormattedID','Name','_ValidFrom','_ValidTo','CreationDate',field_name];
    	var fetch_hydrate = [];
    	if (field_name == "ScheduleState" || field_name== "State"){
    		fetch_hydrate.push(field_name);
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
    _buildCustomStore: function(data, field_name, process_states){
    	this.logger.log('_buildCustomStore', data.length);
    	
    	var data_hash = {};
    	Ext.each(data, function(d){
    		var formatted_id = d.get('FormattedID');
    		var row = data_hash[formatted_id];
    		if (!row){
     			row = {};
    			row['FormattedID'] = formatted_id;
    			row['CreationDate'] = d.get('CreationDate');
    			row['Transitions'] = [];
    		}
    		var transition = {};
    		transition['Date'] = d.get('_ValidFrom');
    		transition['State'] = d.get(field_name);
    		row['Transitions'].push(transition);
    		row['Name'] = d.get('Name');
    		var state = d.get(field_name);
    		var state_date = d.get('_ValidFrom');
    		var current_state_date = row[state];
    		
    		if (!current_state_date || state_date > current_state_date){
    			row[state] = state_date;
    		}
    		data_hash[formatted_id] = row;
    	});
    	console.log(data_hash);

    	var grid_columns = ['FormattedID','Name','Transitions','CreationDate','None','None_Age'];
		Ext.each(process_states, function(state){
			grid_columns.push(state);
			grid_columns.push(state + '_Age');
		});
		
    	
    	var data = [];
    	Object.keys(data_hash).forEach(function(key) { 
    		//Calculate State Age
    		var row = data_hash[key];
    		//Initialize the row headers
    		Ext.each(process_states, function(state){
    			if (!row[state]){
    				row[state] ="";
    			}
    			row[state + '_Age'] =0;
    		});
    		row["None"] =row['CreationDate'];
    		row["None_Age"] =0; 

    		//Because of the sort, this assumes that the dates are sorted ascending
    		var prev_date = row['CreationDate'];
    		var prev_state = 'None';  
    		var num_transitions =0;
    		Ext.each(row['Transitions'], function(rt){
     			var age_key = prev_state + '_Age';
     			if (Ext.Array.contains(grid_columns, age_key)){
            	    var ms = Ext.Date.getElapsed(new Date(rt['Date']),new Date(prev_date));
             	    var days = Math.round(ms/1000/60/60/24);
        			row[age_key] += days;
             	    prev_state = rt['State'];
             	    prev_date = rt['Date'];
             	    num_transitions++;
     			}
    		});
    		row['Transitions'] = num_transitions;
    		data.push(row);
    	});
    	console.log(grid_columns, data);
    	var store = Ext.create('Rally.data.custom.Store', {
	        data: data,
	        autoLoad: true
	    });
    	var gcolcfgs = [];
		Ext.each(grid_columns, function(col){
			var colcfgs = {};
			colcfgs['dataIndex'] = col;
			colcfgs['text'] = col;
			gcolcfgs.push(colcfgs);
		});
		
		if (this.down('#age-grid')){
			this.down('#age-grid').destroy();
		}

		this.down('#display_box').add({
			xtype:'rallygrid',
			store: store,
			itemId: 'age-grid',
			columnCfgs: gcolcfgs
		});

    	
    },
    _alertError: function(error){
    	this.logger.log('_alertError', error);
    	alert('Error: ' + error);
    }
});