/*
 * LICENSE
 *
 * MIT No Attribution License
 * https://opensource.org/license/mit-0/
 * 
 * Copyright 2023 Twinit
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and 
 * associated documentation files (the “Software”), to deal in the Software without restriction, including 
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
 * copies of the Software, and to permit persons to whom the Software is furnished to do so.
 * 
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED 
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL 
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF 
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
*/

/*
 * OVERVIEW
 *
 * The model helpers script, which is used to import a model bimpk to the Item Service does these high level tasks:
 * 1. uploadBimpk - Checks to see if a previous version of the model has been imported
 * 2. extractBimpk - Extracts, processes, and transforms the model data in the bimpk into items to be imported in the Item Service
 * 3. createBIMCollections - If not previous version has been imported, creates a new model composite item and related collections and
 * 		adds the model data to the item service
 * 4. createBIMCollectionVersion - If a previous model verison has been imported, versions the model composite item and all related
 * 		collection and adds the model data to the new versions in the item service
 * 5. createModelDataCache - creates a cache of useful model data for easier and efficient querying later
 * 
 * The orchestrator backed by this script three params when it is executed:
 * 1. filename - the name of the bimpk file being imported with extension
 * 2. fileId - the _id of the bimpk file in the File Service being imported
 * 3. fileVersionId - the version id of the file in the File Service being imported
 * 
 * To walk the code it is best to start at uploadBimpk and follow from there.
 * 
 * Note, this script can be customized to meet any specific model import need for any design system producing a bimpk.
 * For instance the createModelDataCache function can be enhanced to aggregate or sum any type of model data or statistics
 * it could expensive to compute on the fly. By having Twinit perform that expensive compute at import time you can
 * enhance the speed of a client by fetching the precomputed information. Or if there are other properties your
 * application would beneift from having directly on the element items then the extractBimpk function can be enhanced
 * to place those properties directly on the element at import time.
 * 
 * This script file a generic base script that can be enhanced and changes to meet your needs.
*/

// This function groups objects together based on obj[property] by replacing . with empty string
const groupBy = (objectArray, property) => {
	return objectArray.reduce((acc, obj) => {
		let key = obj[property];

		// Replaces . with empty string
		key = key.replace(/[\.]+/g, '');

		// Check if the object exists
		// If not, create an empty object with the key
		if (!acc[key]) {
			acc[key] = {};
		}

		// Add object to list for given key's value
		acc[key] = obj;

		return acc;
	}, {});
}

// This function relates items to each other
const _mapItemsAsRelated = (parentItems, relatedItems, fromField, relatedField) => {
	const res = [];

	for (let i = 0, l = parentItems.length; i < l; i++) {
		let relatedRecs = [];

		const parentItem = parentItems[i];
		let fromValues = [];

		if (!(parentItem[fromField]) && fromField.indexOf('.') > 1) {
			fromValues = fromField.split('.').reduce((o, i) => o[i] || [], parentItem);
		} else {
			fromValues = Array.isArray(parentItem[fromField]) ? parentItem[fromField] : [parentItem[fromField]];
		}

		if (fromValues && fromValues.length > 0)
			relatedRecs = relatedItems.filter((r) => fromValues.includes(r[relatedField]));

		if (relatedRecs.length > 0) {
			res.push({
				parentItem: parentItems[i],
				relatedItems: relatedRecs
			});
		}
	}

	return res;
}

// This function adds items to the collections and creates relationship between different items in the collections
const createRelatedItemsAndRelationships = async (_colls, IafScriptEngine, ctx) => {
	console.log(JSON.stringify({ 'message': 'Creating Model Relations and Related Items' }));

	// Creates related collection by adding relatedCollections array to composite item (namedCompositeItemId)
	await IafScriptEngine.addRelatedCollections({
		'namedCompositeItemId': IafScriptEngine.getVar('bim_model')._id,
		'relatedCollections': [
			_colls.model_els_coll._userItemId,
			_colls.model_els_props_coll._userItemId,
			_colls.model_type_el_coll._userItemId,
			_colls.data_cache_coll._userItemId,
			_colls.model_geom_file_coll._userItemId,
			_colls.model_geom_views_coll._userItemId,
		]
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create related collection' }));

	// Create Element items
	// An array of related items to be created
	// Add items in the manage_els variable to the model_els_coll
	// manage_els is _objectsArray.objects without properties
	await IafScriptEngine.createItemsBulk({
		'_userItemId': _colls.model_els_coll._userItemId,
		'_namespaces': ctx._namespaces,
		'items': IafScriptEngine.getVar('manage_els')
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create Related Collection manage_els' }));

	// Create Type Property items
	// An array of related items to be created
	// Add items in the manage_type_els variable to the model_type_el_coll
	// manage_type_els is _objectsArray.types
	await IafScriptEngine.createItemsBulk({
		'_userItemId': _colls.model_type_el_coll._userItemId,
		'_namespaces': ctx._namespaces,
		'items': IafScriptEngine.getVar('manage_type_els')
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create Related Collection manage_type_els' }));

	// Creates Instance (Element) Property items and relates them to the Element in one call
	// A high level method to take an array of items and create them as Related to Parents
	// Add items in the properties variable to the model_els_props_coll
	// properties is _objectsArray.objects.properties
	// Relate model_els_props_coll to the model_els_coll
	await IafScriptEngine.createItemsAsRelatedBulk({
		'parentUserItemId': _colls.model_els_coll._userItemId,
		'_userItemId': _colls.model_els_props_coll._userItemId,
		'_namespaces': ctx._namespaces,
		'items': IafScriptEngine.getVar('properties')
	}, ctx);
	console.log('Create Related Collection properties');

	// Create relations between Elements and Type Properties
	// Add relationship between two related items in different collections
	// Relate model_els_coll with model_type_el_coll based on releationships defined in manage_el_to_type_relations
	await IafScriptEngine.createRelations({
		'parentUserItemId': _colls.model_els_coll._userItemId,
		'_userItemId': _colls.model_type_el_coll._userItemId,
		'_namespaces': ctx._namespaces,
		'relations': IafScriptEngine.getVar('manage_el_to_type_relations')
	}, ctx);
	console.log('Create Related Collection Relations');

	// Create outparams variable
	await IafScriptEngine.setVar('outparams', {
		'filecolid': _colls.model_geom_file_coll._userItemId,
		'viewcolid': _colls.model_geom_views_coll._userItemId,
		'compositeitemid': IafScriptEngine.getVar('bim_model')._id,
		'myCollections': _colls
	});
}

// This function creates the collections that will be used in the Model Composite Item
const createBIMCollections = async (param, IafScriptEngine, ctx) => {
	console.log(JSON.stringify({ 'message': 'Creating Model Collections' }));

	// package_name is the File Name
	const packagename = await IafScriptEngine.getVar('package_name');
	// package_name_short is the shortened File Name
	const packagenameShort = await IafScriptEngine.getVar('package_name_short');

	// Elements Collection
	const elementsCol = {
		'_name': packagename + '_elements',
		'_shortName': packagenameShort + '_ba_elem',
		'_description': 'Elements in BA model',
		'_userType': 'rvt_elements',
		'_namespaces': ctx._namespaces
	}

	// Create a collection based on elementsCol above
	const model_els_coll = await IafScriptEngine.createCollection(elementsCol, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection - Element Collection' }));

	// Elements Collection Index
	const elemCollIndex = {
		'_id': model_els_coll._userItemId,
		indexDefs: [
			{
				key: {
					'id': 1,
				},
				options: {
					name: 'model_els_coll_id',
					default_language: 'english'
				}
			},
			{
				key: {
					'source_id': 1,
				},
				options: {
					name: 'model_els_coll_source_id',
					default_language: 'english'
				}
			}
		]
	};

	// Create or recreate index based on elemCollIndex above
	await IafScriptEngine.createOrRecreateIndex(elemCollIndex, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Index - Element Collection Index' }));

	// Model Element Properties Collection
	const modelElemPropsCol = {
		'_name': packagename + '_elem_props',
		'_shortName': packagenameShort + '_elprops',
		'_description': 'Element Props in BA model',
		'_userType': 'rvt_element_props',
		'_namespaces': ctx._namespaces
	}

	// Create a collection based on modelElemPropsCol above
	const model_els_props_coll = await IafScriptEngine.createCollection(modelElemPropsCol, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection - Element Properties Collection' }));

	// Type Elements Collection
	const typeElemsCol = {
		'_name': packagename + '_type_el',
		'_shortName': packagenameShort + '_type_el',
		'_description': 'Type Elements in BA Check model',
		'_userType': 'rvt_type_elements',
		'_namespaces': ctx._namespaces
	}

	// Create a collection based on typeElemsCol above
	const model_type_el_coll = await IafScriptEngine.createCollection(typeElemsCol, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection - Type Element Collection' }));

	// Type Element Collection Index
	const typeElemCollIndex = {
		'_id': model_type_el_coll._userItemId,
		indexDefs: [
			{
				key: {
					'id': 1,
				},
				options: {
					name: 'typeElemsCol_id',
					default_language: 'english'
				}
			},
			{
				key: {
					'source_id': 1,
				},
				options: {
					name: 'typeElemsCol_source_id',
					default_language: 'english'
				}
			}
		]
	}

	// Create or recreate index based on typeElemCollIndex above
	await IafScriptEngine.createOrRecreateIndex(typeElemCollIndex, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Index - Type Element Collection Index' }));

	// Geometry Files Collection
	const geometryFilesCol = {
		'_name': packagename + '_geom_file',
		'_shortName': packagenameShort + '_geom_file',
		'_description': 'File Collection for Geometry Files',
		'_userType': 'bim_model_geomresources',
		'_namespaces': ctx._namespaces
	}

	// Create a collection based on geometryFiles above
	const model_geom_file_coll = await IafScriptEngine.createCollection(geometryFilesCol, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection - Geometry File Collection' }));

	// Geometry View Collection
	const geometryViewsCol = {
		'_name': packagename + '_geom_view',
		'_shortName': packagenameShort + '_geom_view',
		'_description': 'Geometry Views in Model',
		'_userType': 'bim_model_geomviews',
		'_namespaces': ctx._namespaces
	}

	// Create a collection based on geometryViewsCol above
	const model_geom_views_coll = await IafScriptEngine.createCollection(geometryViewsCol, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection - Geometry View Collection' }));

	// Model Data Cache Collection
	const dataCacheCol = {
		'_name': packagename + '_data_cache',
		'_shortName': packagenameShort + '_data_cache',
		'_description': 'Data cached about imported model',
		'_userType': 'data_cache',
		'_namespaces': ctx._namespaces
	}

	// Create a collection based on dataCacheCol above
	const data_cache_coll = await IafScriptEngine.createCollection(dataCacheCol, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection - Model Data Cache Collection' }));

	// Type Element Collection Index
	const dataCacheCollIndex = {
		'_id': data_cache_coll._userItemId,
		indexDefs: [
			{
				key: {
					'dataType': 'text',
				},
				options: {
					name: 'dataCacheCol_dataType',
					default_language: 'english'
				}
			},
		]
	}

	// Create or recreate index based on dataCacheCollIndex above
	await IafScriptEngine.createOrRecreateIndex(dataCacheCollIndex, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Index - Data Cache Collection Index' }));

	const bimpkFileId = await IafScriptEngine.getVar('bimpk_fileid');
	const bimpkFileVersionId = await IafScriptEngine.getVar('bimpk_fileVersionId');

	// Model Composite Item
	const modelCompItem = {
		'_name': packagename,
		'_shortName': packagenameShort + '_modelver',
		'_description': 'BIM model version by transform',
		'_userType': 'bim_model_version',
		'_namespaces': ctx._namespaces,
		'_version': {
			'_userAttributes': {
				'bimpk': {
					'fileId': bimpkFileId,
					'fileVersionId': bimpkFileVersionId
				}
			}
		}
	}

	// Create a composite item based on modelCompItem above
	const model = await IafScriptEngine.createNamedCompositeItem(modelCompItem, ctx)
	await IafScriptEngine.setVar('bim_model', model);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection - Model Composite Item' }));

	const _myCollections = {
		'model_els_coll': model_els_coll,
		'model_els_props_coll': model_els_props_coll,
		'model_type_el_coll': model_type_el_coll,
		'model_geom_file_coll': model_geom_file_coll,
		'model_geom_views_coll': model_geom_views_coll,
		'data_cache_coll': data_cache_coll,
	};

	// Relate items and relationships based on _myCollections
	await createRelatedItemsAndRelationships(_myCollections, IafScriptEngine, ctx);
}

// This function creates new versions of the Model NamedCompositeItems and its related Collections
const createBIMCollectionVersion = async (param, PlatformApi, IafScriptEngine, ctx) => {
	console.log(JSON.stringify({ 'message': 'Found Previous Model Creating Versions' }));

	// Get the bim_model from the stored variables
	// Remember bim_model is a composite item
	const bimModel = await IafScriptEngine.getVar('bim_model')

	// Get collections in the bimModel composite item
	const modelRelatedCollection = await IafScriptEngine.getCollectionsInComposite(bimModel._id, null, ctx);
	console.log(JSON.stringify({ 'message': 'Fetch bim_model Composite Collection' }));

	// Create a new version for the composite item
	const newModelVer = await IafScriptEngine.createNamedUserItemVersion({ 'namedUserItemId': bimModel._id }, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Version - bim_model' }));

	// Refetch file related information just in case they updated
	const bimpkFileId = await IafScriptEngine.getVar('bimpk_fileid');
	const bimpkFileVersionId = await IafScriptEngine.getVar('bimpk_fileVersionId');

	newModelVer._userAttributes = {
		bimpk: {
			fileId: bimpkFileId,
			fileVersionId: bimpkFileVersionId
		}
	}

	// Update composite item with the new fileID and fileVersionId
	await PlatformApi.IafItemSvc.updateNamedUserItemVersion(bimModel._userItemId, newModelVer._id, newModelVer, ctx)
	console.log(JSON.stringify({ 'message': 'Update BIM Collection Version - bim_model' }));

	// Fetch individual collections from the composite item
	const model_els_coll = modelRelatedCollection.find(x => x._userType === 'rvt_elements');
	const model_els_props_coll = modelRelatedCollection.find(x => x._userType === 'rvt_element_props');
	const model_type_el_coll = modelRelatedCollection.find(x => x._userType === 'rvt_type_elements');
	const model_geom_file_coll = modelRelatedCollection.find(x => x._userType === 'bim_model_geomresources');
	const model_geom_views_coll = modelRelatedCollection.find(x => x._userType === 'bim_model_geomviews');

	// data_cache may not be present
	// Be prepared to create a new data_cache collection if it does not exist
	let data_cache_coll = modelRelatedCollection.find(x => x._userType === 'data_cache');
	if (!data_cache_coll) {
		let packagename = await IafScriptEngine.getVar('package_name');
		let packagenameShort = await IafScriptEngine.getVar('package_name_short');

		let data_cache_coll_def = {
			'_name': packagename + '_data_cache',
			'_shortName': packagenameShort + '_data_cache',
			'_description': 'Data cached about imported model',
			'_userType': 'data_cache',
			'_namespaces': ctx._namespaces
		}

		data_cache_coll = await IafScriptEngine.createCollection(data_cache_coll_def, ctx);
		console.log(JSON.stringify({ 'message': 'Create Model Data Cache' }));

		// Type Element Collection Index
		const dataCacheCollIndex = {
			'_id': data_cache_coll._userItemId,
			indexDefs: [
				{
					key: {
						'dataType': 'text',
					},
					options: {
						name: 'dataCacheCol_dataType',
						default_language: 'english'
					}
				},
			]
		}

		// Create or recreate index based on dataCacheCollIndex above
		await IafScriptEngine.createOrRecreateIndex(dataCacheCollIndex, ctx);
		console.log(JSON.stringify({ 'message': 'Create BIM Collection Index - Data Cache Collection Index' }));
	}

	// Create versions for each collection
	await IafScriptEngine.createNamedUserItemVersion({
		'namedUserItemId': model_els_coll._userItemId
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Version model_els_coll' }));

	await IafScriptEngine.createNamedUserItemVersion({
		'namedUserItemId': model_els_props_coll._userItemId
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Version model_els_props_coll' }));

	await IafScriptEngine.createNamedUserItemVersion({
		'namedUserItemId': model_type_el_coll._userItemId
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Version model_type_el_coll' }));

	await IafScriptEngine.createNamedUserItemVersion({
		'namedUserItemId': data_cache_coll._userItemId
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create Data Cache Version data_cache' }));

	await IafScriptEngine.createNamedUserItemVersion({
		'namedUserItemId': model_geom_file_coll._userItemId
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Version model_geom_file_coll' }));

	await IafScriptEngine.createNamedUserItemVersion({
		'namedUserItemId': model_geom_views_coll._userItemId
	}, ctx);
	console.log(JSON.stringify({ 'message': 'Create BIM Collection Version model_geom_views_coll' }));

	// Elements Collection Index
	const elemCollIndex = {
		'_id': model_els_coll._userItemId,
		indexDefs: [
			{
				key: {
					'id': 1,
				},
				options: {
					name: 'model_els_coll_id',
					default_language: 'english'
				}
			},
			{
				key: {
					'source_id': 1,
				},
				options: {
					name: 'model_els_coll_source_id',
					default_language: 'english'
				}
			}
		]
	};
	await IafScriptEngine.createOrRecreateIndex(elemCollIndex, ctx);
	console.log(JSON.stringify({ 'message': 'element index response' }));

	// Type Element Collection Index
	const typeElemCollIndex = {
		'_id': model_type_el_coll._userItemId,
		indexDefs: [
			{
				key: {
					'id': 1,
				},
				options: {
					name: 'typeElemsCol_id',
					default_language: 'english'
				}
			},
			{
				key: {
					'source_id': 1,
				},
				options: {
					name: 'typeElemsCol_source_id',
					default_language: 'english'
				}
			}
		]
	}
	await IafScriptEngine.createOrRecreateIndex(typeElemCollIndex, ctx);
	console.log(JSON.stringify({ 'message': 'type index response' }));

	// set them in global variables
	await IafScriptEngine.setVar('model_els_coll', model_els_coll);
	await IafScriptEngine.setVar('model_els_props_coll', model_els_props_coll);
	await IafScriptEngine.setVar('model_type_el_coll', model_type_el_coll);
	await IafScriptEngine.setVar('data_cache_coll', data_cache_coll);
	await IafScriptEngine.setVar('model_geom_file_coll', model_geom_file_coll);
	await IafScriptEngine.setVar('model_geom_views_coll', model_geom_views_coll);

	const _myCollections = {
		'model_els_coll': model_els_coll,
		'model_els_props_coll': model_els_props_coll,
		'model_type_el_coll': model_type_el_coll,
		'data_cache_coll': data_cache_coll,
		'model_geom_file_coll': model_geom_file_coll,
		'model_geom_views_coll': model_geom_views_coll,
	};

	await createRelatedItemsAndRelationships(_myCollections, IafScriptEngine, ctx);
}

// extractBimpk extracts and processes the data in the model bimpk file
// This function performs the following operations
// Data Cleansing: Eliminates unnecessary data and groups data
// Data Modification: Assign new data to the elements such as dName
// Sets Variables: Creates variables and assigns data to be used later on
const extractBimpk = async (param, IafScriptEngine, ctx) => {
	try {
		// As a part of the data cleansing process, we are creating a new object with 3 different arrays
		// We will assign data to each array once we clean and modify data
		const _objectsArray = {
			'objects': [],
			'properties': [],
			'types': []
		};

		const _myProperties = [];

		// There are 3 important aspects of this data that we are interested in
		// Please be aware that they will be called with different names while storing them in varibales

		// 1) Types
		// 2) Objects
		// 3) Properties

		for (const file of param.files) {
			for (const occ of file.occurences) {
				// PROPERTIES
				// No modification on properties array as it contains very little data
				// We are just copying it over to the object array we have created above
				_objectsArray.properties = occ.objects.properties;

				// TYPES
				for (const type of occ.objects.types) {
					// Meta data about types. No need to modify anything apart from renaming for better undestandability
					const _type = {
						'id': type.id,
						'name': type.name,
						'source_id': type.sourceId,
					}

					////////////////////////////////////////
					// _type object
					// {
					// 		id
					// 		name
					// 		source_id
					// }
					////////////////////////////////////////

					// Types contain an array called properties
					// It contains information about properties of a given type

					// 	properties: [
					// 		{
					// 			id
					// 			name
					// 			val
					// 		},
					// 		...
					// 	]
					for (const prop of type.properties) {
						// Find the respective property in the properties array
						const _myProp = _objectsArray.properties.find(x => x.id === prop.id);

						// Get the dName from the respective property and assign it to the property
						prop.dName = _myProp.dName;

						// Get the type from the respective property and assign it to the property
						prop.srcType = _myProp.type;

						// Get the assetCategory from the respective property and assign it to the property
						if (_myProp.assetCategory != undefined || _myProp.assetCategory != null) {
							_type.baType = _myProp.assetCategory;
						}

						if (_myProp.psDispName != undefined || _myProp.psDispName != null) {
							prop.psDispName = _myProp.psDispName;
						}
					}

					////////////////////////////////////////
					// properties: [
					// 		{
					// 			id
					// 			name
					// 			val
					//			dName
					// 			baType
					//          psDispName
					// 		},
					// 		...
					// 	]
					////////////////////////////////////////

					// Assign a new Mongo ID. This is different from the id above
					_type._id = await IafScriptEngine.newID('mongo', {
						'format': 'hex'
					});

					// Group properties array by the dName
					_type.properties = groupBy(type.properties, 'dName');

					////////////////////////////////////////
					// _type object
					// {
					// 		id
					// 		name
					// 		source_id
					// 		properties: {
					// 			key1: {
					// 				id
					// 				name
					// 				val
					//				dName
					// 				baType
					// 			},
					// 			key1: {
					// 				id
					// 				name
					// 				val
					//				dName
					// 				baType
					// 			},
					// 			...
					// 		}
					// 		_id
					// }
					////////////////////////////////////////

					// Push it to the object array we have created above
					_objectsArray.types.push(_type);
				}

				// OBJECTS
				for (const elem of occ.objects.objects) {
					// Meta data about objects. No need to modify anything apart from renaming for better undestandability
					const _myObj = {
						'package_id': elem.id,
						'type_id': elem.type,
						'source_id': elem.sourceId,
						'relationships': elem.relationships,
						'source_filename': file.name,
					}

					////////////////////////////////////////
					// _myObj object
					// {
					// 		package_id
					// 		type_id
					// 		source_id
					// 		relationships
					// 		source_filename
					// }
					////////////////////////////////////////

					// Find the respective type based on the ids
					// Objects has a field called type/type_id which corresponds to the id of the type
					// THis is REVIT specific and can be modified to accomodate other systems
					const type = _objectsArray.types.find(type => type.id === elem.type);

					if (type.properties) {
						if (type.properties?.['Revit Family'] != undefined || type.properties?.['Revit Family'] != null) {
							_myObj.revitFamily = type.properties['Revit Family'];
						}

						if (type.properties?.['Revit Type'] != undefined || type.properties?.['Revit Type'] != null) {
							_myObj.revitType = type.properties['Revit Type'];
						}

						if (type.properties?.['Revit Category'] != undefined || type.properties?.['Revit Category'] != null) {
							_myObj.revitCategory = type.properties['Revit Category'];
						}
					}

					// Assign baType from the respective type
					if (type.baType != undefined || type.baType != null) {
						_myObj.ba_type = type.baType;
					}

					////////////////////////////////////////
					// _myObj object
					// {
					// 		package_id
					// 		type_id
					// 		source_id
					// 		relationships
					// 		source_filename
					// 		ba_type
					// 		revitFamily
					// 		revitType
					// }
					////////////////////////////////////////

					// Objects contain an array called properties
					// It contains information about instance properties of a given object

					// 	properties: [
					// 		{
					// 			id
					// 			name
					// 			val
					// 		},
					// 		...
					// 	]
					for (const prop of elem.properties) {
						// Find the respective property in the properties array
						const _myProp = _objectsArray.properties.find(x => x.id == prop.id);

						// Get the dName from the respective property and assign it to the property
						prop.dName = _myProp.dName;

						// Get the type from the respective property and assign it to the property
						prop.srcType = _myProp.type;

						if (_myProp.psDispName != undefined || _myProp.psDispName != null) {
							prop.psDispName = _myProp.psDispName;
						}

						if (prop.name === 'System.elementId') {
							_myObj.systemElementId = prop;
						}
					}

					////////////////////////////////////////
					// properties: [
					// 		{
					// 			id
					// 			name
					// 			val
					//			dName
					//          psDispName
					// 		},
					// 		...
					// 	]
					////////////////////////////////////////

					// Assign a new Mongo ID
					_myObj._id = await IafScriptEngine.newID('mongo', {
						'format': 'hex'
					});

					// Group properties array by the dName
					_myObj.properties = groupBy(elem.properties, 'dName');

					////////////////////////////////////////
					// _myObj object
					// {
					// 		package_id
					// 		type_id
					// 		source_id
					// 		relationships
					// 		source_filename
					// 		ba_type
					// 		revitFamily
					// 		revitType
					//		systemElementId
					// 		properties: {
					// 			key1: {
					// 				id
					// 				name
					// 				val
					//				dName
					// 			},
					// 			key1: {
					// 				id
					// 				name
					// 				val
					//				dName
					// 			},
					// 			...
					// 		}
					// 		_id
					// }
					////////////////////////////////////////

					// Push _id and properties array to the array create above
					_myProperties.push({
						_id: _myObj._id,
						properties: _myObj.properties
					});

					// Push it to the object array we have created above
					_objectsArray.objects.push(_myObj);
				}
			}
		}
		console.log(JSON.stringify({ 'message': 'Data Extraction is complete' }));

		// Creating and setting variables to be used in later steps

		await IafScriptEngine.setVar('properties', _myProperties);

		// Analogy: rvt_elements
		_objectsArray.objects.forEach(e => delete e.properties );

		// Analogy: rvt_elements
		await IafScriptEngine.setVar('manage_els', _objectsArray.objects);
		// Analogy: type properties
		await IafScriptEngine.setVar('manage_type_els', _objectsArray.types);

		// Relates objects to types (just creates relationship objects)
		// Parent is going to be the objects (without properties) and the related are going to be the types
		const related = _mapItemsAsRelated(
			await IafScriptEngine.getVar('manage_els'),
			await IafScriptEngine.getVar('manage_type_els'), 'type_id', 'id'
		);

		await IafScriptEngine.setVar('manage_el_to_type_relations', related);
	} catch (err) {
		console.log(err);
	}
}

// This function caches data about file graphics and classification
const cacheSourceFileGraphicsIds = async (params, PlatformApi, IafScriptEngine, ctx) => {
	const { model_els_coll, data_cache_coll } = params.inparams.myCollections

	// Finds the distinct values for a specified field across a single collection or view and returns the results in an array
	// No repeated values
	const sourcefiles = await IafScriptEngine.getDistinct({
		collectionDesc: { _userType: model_els_coll._userType, _userItemId: model_els_coll._userItemId },
		field: 'source_filename',
		options: { getCollInfo: true }
	}, ctx)

	const sourcefileNames = sourcefiles._list[0]._versions[0]._relatedItems.source_filename

	// Loop through, get packageIds, and puah it to the array
	const cacheDataItems = []
	for (let i = 0; i < sourcefileNames.length; i++) {

		const packageIds = await IafScriptEngine.getDistinct({
			collectionDesc: { _userType: model_els_coll._userType, _userItemId: model_els_coll._userItemId },
			query: { source_filename: sourcefileNames[i] },
			field: 'package_id',
			options: { getCollInfo: true }
		}, ctx)

		cacheDataItems.push({
			dataType: 'sourcefileToPkgIds',
			data: {
				sourcefile: sourcefileNames[i],
				package_ids: packageIds._list[0]._versions[0]._relatedItems.package_id
			}
		})
	}

	await IafScriptEngine.createItemsBulk({
		'_userItemId': data_cache_coll._userItemId,
		'_namespaces': ctx._namespaces,
		'items': cacheDataItems
	}, ctx);
	console.log('Create Cache Data: source filenames to package_ids');
}

export default {
	async uploadBimpk(params, libraries, ctx) {
		const { PlatformApi, IafScriptEngine } = libraries;

		// these are the params passed to the orchestrator
		const param = params.inparams;

		// set global variables first
		await IafScriptEngine.setVar('namespaces', ctx._namespaces);
		await IafScriptEngine.setVar('package_name', param.filename);
		await IafScriptEngine.setVar('package_name_short', param.filename.substring(0, 11));
		await IafScriptEngine.setVar('bimpk_fileid', param._fileId);
		await IafScriptEngine.setVar('bimpk_fileVersionId', param._fileVersionId);

		// check to see if the model to be imported has a previous version imported
		// we search for a Model NamedCompositeItem wiht the files fileId
		const res = await PlatformApi.IafItemSvc.getNamedUserItems({
			'query': {
				'_userType': 'bim_model_version',
				'_versions._userAttributes.bimpk.fileId': param._fileId,
				'_itemClass': 'NamedCompositeItem'
			}
		}, ctx, {});

		const bim_model = res._list[0];
		console.log(JSON.stringify({ 'message': 'model -> ' + JSON.stringify(bim_model) }));

		if (bim_model) {
			// if there is a previous model version we create a new version of the model
			// composite item and new versions of its related collections
			IafScriptEngine.setVar('bim_model', bim_model);

			await extractBimpk(param, IafScriptEngine, ctx);
			await createBIMCollectionVersion(param, PlatformApi, IafScriptEngine, ctx);
		} else {
			// if there is no previous model version we create everything new
			await extractBimpk(param, IafScriptEngine, ctx);
			await createBIMCollections(param, IafScriptEngine, ctx);
		}

		return await IafScriptEngine.getVar('outparams');
	},
	async createModelDataCache(params, libraries, ctx) {
		const { PlatformApi, IafScriptEngine } = libraries;

		await cacheSourceFileGraphicsIds(params, PlatformApi, IafScriptEngine, ctx)
	}
}