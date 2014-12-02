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
    
        var cb_fieldpicker = this.down('#criteria_box').add({
            xtype: 'rallyfieldpicker',
            autoExpand: false,
            modelTypes: [model_type],
            margin: '0 0 5 0',
            fieldLabel: 'Additional Display Columns',
            alwaysExpanded: false,
            itemId: 'additional-field-selector',
            minWidth: 300,
            alwaysSelectedValues: ['FormattedID','Name'],
        });

        var field_store = cb_field.getStore();
        field_store.on('load',this._filterDropDownList,this);

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

    _filterPickerDropDownList: function() {
        var fields = this.down('#field-selector').getModel().getFields();
        this.logger.log('_filterPickerDropDownList');
        var whitelist_types = ['STRING','BOOLEAN','TEXT','INTEGER','DECIMAL','DATE'];
        var whitelist_fields = [];
       
        Ext.each(fields, function(f){
            if (f.attributeDefinition){
                if (Ext.Array.contains(whitelist_types,f.attributeDefinition.AttributeType)){
                    whitelist_fields.push(f.name);
                }
            }
        });
        this.down('#additional-field-selector').setFieldWhiteList(whitelist_fields);
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
                return valid;
            } 
        }]);
        this.down('#field-selector').setValue(store.getAt(1));
        this._filterPickerDropDownList()
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
                    remoteFilter: false,
                    remoteSort: false,
                    pageSize: 200
                });
                
                /*
                 * Filter and Grid Controls 
                 */ 
                var columns = Object.keys(data[0]);  
                this._addFilterControls(columns);

                var gcolcfgs = [];
                Object.keys(data[0]).forEach(function(key) {
                    var colcfgs = {};
                    if (key == 'Name'){
                        colcfgs['flex'] = 1;
                    }
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
    },
    
    /*
     * Filter Functions
     * 
     */
    _addFilterControls: function(columns){
      this.logger.log('_addFilterControls',columns);
        var cb = this.down('#filter_box').add({
            xtype: 'rallycombobox',
            fieldLabel: 'Filter Results By',
            labelAlign: 'right',
            itemId: 'filter-property',
            store: this._getFilterPropertyStore(columns),
            displayField: 'name',
            valueField: 'name',
            padding: 5,
            listeners: {
                scope: this,
                change: this.addFilterCriteriaBoxes
            }              
        });
        cb.setValue('Name');

    },
    _filterGridWithCustomStore: function(){
           var prop = this.down('#filter-property').getValue();
           var val = this.down('#filter-value').getValue(); 
          if (this.down('#filter-operator')){
              op = this.down('#filter-operator').getValue(); 
        }
          this.logger.log('filter', prop, op, val);

          this.down('#report-grid').getStore().filter({filterFn:function(item){
            
            var re = new RegExp(val,'gi');
            var current_val = item.get(prop);
                switch (op){
                    case '>=':
                        return Number(current_val) >= val;
                    case '<=':
                        return Number(current_val) <= val;
                    case '>':
                        return Number(current_val) > val;
                    case '<':
                        return Number(current_val) < val;
                    case 'contains':
                        var re = new RegExp(val,'gi');
                        return re.test(current_val);
                    case '=':
                    case undefined:
                        return current_val.toLowerCase() == val.toLowerCase();  
                }
                return false; 
        }});
    },

    addFilterCriteriaBoxes: function(cb, newValue){
        this.logger.log('addFilterCriteriaBoxes', newValue);
        if (this.down('#filter-operator')){this.down('#filter-operator').destroy();}
        if (this.down('#filter-value')){this.down('#filter-value').destroy();}
        if (this.down('#filter-button')){this.down('#filter-button').destroy();}
        if (this.down('#clear-filter-button')){this.down('#clear-filter-button').destroy();}
       
        var operator_store = this._getFilterOperatorStore(newValue);
        if (operator_store != null){
            var cbo = this.down('#filter_box').add({
                xtype: 'rallycombobox',
                itemId: 'filter-operator',
                displayField: 'name',
                valueField: 'name',
                padding: 5,
                store: this._getFilterOperatorStore(newValue)
            });
        }
        
        var filter_value_ctl = this._getFilterValueControl(newValue);
        this.down('#filter_box').add(filter_value_ctl);         
        
        this.down('#filter_box').add({
            xtype: 'rallybutton',
            itemId: 'filter-button',
            scope: this, 
            text: 'Filter',
            margin: 5,
            handler: this._filterGridWithCustomStore
        });
        
        this.down('#filter_box').add({
            xtype: 'rallybutton',
            itemId: 'clear-filter-button',
            scope: this, 
            text: 'Clear',
            margin: 5,
            handler: this._clearGridFilter
        });

    },
    _getFilterValueControl: function(newVal){
        
        var ctl = {
                xtype: 'rallytextfield',
                padding: 5,
                itemId: 'filter-value',
                allowNoEntry: false
            };

        var field = this.down('#field-selector').getModel().getField(newVal);
      //  var field = this.typeModel.getField(newVal);
        var model_name = this.down('#field-selector').getModel().getName();

        if (field){
            switch(field.attributeDefinition.AttributeType){
              case 'BOOLEAN':  
                  ctl = {
                        xtype: 'rallycombobox',
                        padding: 5,
                        itemId: 'filter-value',
                        store: ['true','false']
                    };
                  break;
          case 'TEXT':
          case 'STRING':
          case 'STATE':
          case 'RATING':
              if (field.attributeDefinition.AttributeType == 'RATING' || 
                  field.attributeDefinition.AttributeType == 'STATE' ||
                      field.attributeDefinition.AllowedValues.length > 0){
                  ctl = {
                              xtype: 'rallyfieldvaluecombobox',
                              model: model_name,
                              padding: 5,
                              itemId: 'filter-value',
                              field: field.name
                      };
                  console.log('statecontrol',ctl);    
  
              }
                  break;
          case 'OBJECT':
              //Release, Iteration, User, Project, artifact links
              var schema = field.attributeDefinition.SchemaType;
              if (schema == 'Iteration') {
                  ctl = {
                        xtype: 'rallyiterationcombobox',
                        itemId: 'filter-value',
                        padding: 5
                  };
              } else if (schema == 'Release') {
                  ctl = {
                      xtype: 'rallyreleasecombobox',
                      itemId: 'filter-value',
                      padding: 5
                  };
              } else if (schema == 'User') {
                ctl = {
                      xtype: 'rallyusersearchcombobox',
                      project: this.getContext().getProject(),
                      itemId: 'filter-value',
                      padding: 5
                    };
                } else if (schema == 'Project') {
                    ctl = {
                            xtype: 'rallyprojectpicker',
                            itemId: 'filter-value',
                            padding: 5
                    };
                  
              } else if (schema == 'State'){
                ctl = {
                        xtype: 'rallyfieldvaluecombobox',
                        itemId: 'filter-value',
                        padding: 5,
                        model: model_name,
                        field: field.name
                };

              }
              break;
          case 'DATE':
          case 'DECIMAL':
          case 'INTEGER':
          case 'QUANTITY':
          case 'WEB_LINK':
          case 'RAW':
          case 'BINARY_DATA':
          case 'COLLECTION':
          default:
            }
        }// if field
        return ctl; 
    },
    _clearGridFilter: function(){
        if (this.down('#report-grid')){
          this.down('#report-grid').getStore().clearFilter();
        }
        
        this.down('#filter-property').setValue('');
        if (this.down('#filter-operator')){
            this.down('#filter-operator').destroy();
        }
        if (this.down('#filter-value')){
          this.down('#filter-value').destroy();
        }
    },
    _getFilterPropertyStore: function(columns){
              this.logger.log('_getFilterPropertyStore');
        
              var data = [];
            Ext.each(columns, function(col){
                data.push( {'name': col} );
            },this);
            
            var fb_store = Ext.create('Rally.data.custom.Store', {
                data: data,
                autoLoad: true
            });
            return fb_store; 
    },

    _getFilterOperatorStore: function(newVal){

        var field = this.down('#field-selector').getModel().getField(newVal);
        this.logger.log('_getFilterOperatorStore', newVal, field);
        
        var data = [];
        var operators = [];
        if (field && field.attributeDefinition.AttributeType != 'BOOLEAN' && 
                field.name.toLowerCase() == newVal.toLowerCase()) {
            if (field.attributeDefinition.AttributeType == 'STRING' || field.attributeDefinition.AttributeType == 'TEXT'){
                operators = [{OperatorName: '='},{OperatorName: 'contains'}];
            } else {
                if (field.attributeDefinition.AttributeType == 'DECIMAL' || field.attributeDefinition.AttributeType == 'INTEGER'){
                    operators = [{OperatorName: '='},{OperatorName: '<='},{OperatorName: '>='},{OperatorName: '<'},{OperatorName: '>'}];
                }
            }
        } else {
            //This is a derived field
            operators = Rally.technicalservices.data.CalculatedStore.getFilterOperators(newVal);
        }

        Ext.each(operators, function(op){
            if (op.OperatorName && op.OperatorName.length > 0 ){
                data.push({'name':op.OperatorName});                        
            }
        });
        
        if (data.length == 0){
            return null;
        }
        
        var fb_store = Ext.create('Rally.data.custom.Store', {
            data: data,
            autoLoad: true
        });
        return fb_store; 
    }
});