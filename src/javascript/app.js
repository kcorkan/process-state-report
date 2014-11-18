Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'criteria_box'},
        {xtype:'container',itemId:'button_box',layout:{type:'hbox'}, padding: 10},
        {xtype:'container',itemId:'filter_box',layout:{type:'hbox'}, padding: 10},
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
        	this.down('#additional-field-selector').destroy();
        	this.down('#view-selector').destroy();
        	this.down('#run-button').destroy();
        	this.down('#export-button').destroy();

        	if (this.down('#report-grid')){
        		this.down('#report-grid').destroy();
        	}
        }
    	
     	var model_type = cb.getValue();
    	var cb_field = this.down('#criteria_box').add({
        	xtype: 'rallyfieldcombobox',
            fieldLabel: 'Field type',
            itemId: 'field-selector',
            model: model_type,
		    labelWidth: 100,
		    minWidth: 300
        }); 
    	
    	var field_store = cb_field.getStore();
    	field_store.on('load',this._filterDropDownList,this);

    	this.down('#criteria_box').add({
    		xtype: 'rallyfieldpicker',
            autoExpand: false,
            modelTypes: [model_type],
            margin: '0 0 5 0',
            fieldLabel: 'Additional Display Columns',
            alwaysExpanded: false,
            itemId: 'additional-field-selector',
            minWidth: 300,
            alwaysSelectedValues: ['FormattedID','Name']
    	});
    	
    	this.down('#criteria_box').add({
			xtype: 'rallycombobox',
			store: Rally.technicalservices.data.CalculatedStore.getViewStore(),
		    itemId: 'view-selector',
		    displayField: 'name',
		    valueField: 'operation',
		    fieldLabel: 'View',
		    labelWidth: 100,
		    minWidth: 300
    	});

    	/*
    	 * Action Buttons
    	 */
    	this.down('#button_box').add({
			xtype: 'rallybutton',
			text: 'Run',
			itemId: 'run-button',
			scope: this,
			handler: this._run,
			margin: '0 10 0 95'
    	});
    	this.down('#button_box').add({
			xtype: 'rallybutton',
			text: 'Export',
			itemId: 'export-button',
			scope: this,
			handler: this._exportData,
			disabled: true,
			margin: '0 10 0 0'
    	});
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
        
        this.down('#criteria_box').add({
            xtype: 'rallycombobox',
            displayField: 'DisplayName',
            fieldLabel: 'Artifact type',
            valueField: 'TypePath',
            itemId: 'type-selector',
            stateId: 'artifact-type',
            stateful: true,
            stateEvents: ['change'],
		    labelWidth: 100,
		    minWidth: 300,
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
                if (field_def.attributeDefinition.AttributeType == 'BOOLEAN'){
                	valid = true;
                }
                return valid;
            } 
        }]);
        this.down('#field-selector').setValue(store.getAt(1));
    },
    _getProcessStates: function(field){
    	var process_states = [];
    	if (field.get('fieldDefinition').attributeDefinition.AttributeType == 'BOOLEAN'){
    		return ["true","false"];
    	}
    	
    	Ext.each(field.get('fieldDefinition').attributeDefinition.AllowedValues, function(av){
    		if (av.StringValue){
        		process_states.push(av.StringValue);
    		}
    	},this);
       	this.logger.log('_getProcessStates', process_states);
    	return process_states;
    },
    _getFetchFields: function(){
    	this.logger.log('_getFetchFields');
    	
    	var selected_values = [];
    	Ext.each(this.down('#additional-field-selector').getValue(), function(obj){
    		selected_values.push(obj.get('name'));
    	},this);
    	
    	var fetch_fields = Ext.Array.merge(this.down('#additional-field-selector').getAlwaysSelectedValues(),
    			selected_values);
    	this.logger.log('_getFetchFields returning', fetch_fields);
    	return fetch_fields;
    },
    _run: function(){
    	this.logger.log('_generateReport');
    	
    	this.setLoading(true);
        
    	//Get Settings
    	var model = this.down('#type-selector').getValue();
    	var field = this.down('#field-selector').getRecord(); 
    	var action = this.down('#view-selector').getValue();
    	var process_states = this._getProcessStates(field);
    	var fetch_fields = this._getFetchFields();

     	var project_id = this.getContext().getProject().ObjectID; 
     	this.logger.log('Run settings:',model,field,action,process_states,project_id);
     	
    	var field_name = field.get('fieldDefinition').name;  
    	var cs = Ext.create('Rally.technicalservices.data.CalculatedStore',{
    		timelineField: field_name,
    		currentProjectId: project_id,
    		timelineStates: process_states,
    		rallyType: model,
    		fetchFields: fetch_fields
    	});
    	cs.load(action).then({
    		scope: this,
    		success: function(data){
    	    	this.logger.log('CalculatedStore.load Success', data.length);
    	    	this.exportData = data; 

    	    	var store = Ext.create('Rally.data.custom.Store', {
    		        data: data,
    		        autoLoad: true,
    		        //limit: 'infinity',
    		        pageSize: 200
    		    });
    	    	
    	    	var gcolcfgs = [];
    	    	Object.keys(data[0]).forEach(function(key) {
    				var colcfgs = {};
    				colcfgs['dataIndex'] = key;
    				colcfgs['text'] = key;
    				gcolcfgs.push(colcfgs);
    	    	});

    	    	if (this.down('#report-grid')){
    	    		this.down('#report-grid').destroy();
    	    	}
    	    	
    			this.down('#display_box').add({
    				xtype:'rallygrid',
    				store: store,
    				itemId: 'report-grid',
    				columnCfgs: gcolcfgs,
    				showPagingToolbar: true,
    				pagingToolbarCfg: {
    					store: store,
    					pageSizes: [100,200,500,1000]
    				}
    			});
    			this.down('#export-button').setDisabled(false);
    			this.setLoading(false);
    		},
    		failure: function(){
    			this.setLoading(false);
    		}
    	});
    },
    _exportData: function(){
    	this.logger.log('_exportData');
    	var fileName = 'data.csv';
    	var keys = [];
    	var data = this.exportData;
    	keys = Object.keys(data[0]);

     	var text = keys.join(',') + '\n';
    	Ext.each(data, function(d){
     		Ext.each(keys, function(key){
     			var val = d[key] || '';
     			if (/\n|,|\t/.test(val)){
           			text += Ext.String.format("\"{0}\",", val);
     			} else {
         			text += Ext.String.format("{0},", val);
     			}
     		});
     		text += '\n';
    	});
    	Rally.technicalservices.FileUtilities.saveTextAsFile(text, fileName.toString());
    }
});