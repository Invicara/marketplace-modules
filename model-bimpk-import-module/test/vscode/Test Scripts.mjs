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
 * READ THIS FIRST
 *
 * This file can used with the Twinit Visual Studio Code Extension to test that your project
 * is correct setup for bimpk model import.
 * 
 * To use this script:
 *
 * 1. Sign in to the TWINIT.DEV extension
 * 2. Expand your project and expand the Scripts node in the tree
 * 3. Right click on the Scripts node and click 'Create New Script'
 * 4. For Script Name enter 'TEST Model Import' or another name as you would like
 * 5. Enter a description, Short Name, and User Type for the 'TEST Model Import Setup' script
 * 6. Open the newly created script and copy and paste this file into it
 * 7. Save and then right click on the script and select 'Commit to New Version'
 * 8. Reopen the script you just committed
 * 9. Right click this script and select 'Step 1 - Upload .bimpk Model File'
 *    When prompted select the 'General Medical - Architecture.bimpk' file included with the test files
 * 10. After the upload script completes right click this script and select 'Step 2 - Import Latest Model Version'
 *    This script will import that latest version of the test .bimpk file
 *    This can be a long runnign process
 * 11. Once the import has completed right click this script and select 'Step 3 - Get Model Composite Item and Related NamedUserCollections'
 *    This script will query the model NamedCompositeItem, the various NamedUserCollections, and the first 5 items
 *    in each NamedUserCollection contained in the model data
*/

/* UTLITY FUNCTIONS */

// Polls the status of a running orchestrator every 30 seconds until it
// reaches the provided status or ERROR
const pollOrchStatus = async (IafDataSource, orchRun, status, callback, ctx) => {
  
	let deferredResolve
	let importPromise = new Promise((resolve, reject) => {
	  deferredResolve = resolve
	})
 
	let orchRunStatus
	const interval = setInterval(async () => {
 
	  const orchRunStatusResp = await IafDataSource.getOrchRunStatus(orchRun.id, ctx)
	  orchRunStatus = orchRunStatusResp[0]
	  callback(orchRunStatus._status)
	  console.log(orchRunStatus._status)
 
	  if (orchRunStatus._status === status || orchRunStatus._status === 'ERROR') {
		 clearInterval(interval)
		 deferredResolve()
	  }
 
	}, 30000)
 
	return await Promise.all([importPromise]).then(() => {
	  return orchRunStatus
	})
 }

let modelImportModule = {

	getRunnableScripts() {
		return [
			{ name: 'Step 1 - Upload .bimpk Model File', script: 'uploadBimpk'},
			{ name: 'Step 2 - Import Latest Model Version', script: 'importLatestModelVersion' },
			{ name: 'Step 3 - Get Model Composite Item and Related NamedUserCollections', script: 'queryModelCompositeItem'},
			{ name: '<----- Helpful Utilities ----->'},
			{ name: 'UTILITY - Delete all bimpks and model data', script: 'reset'}
		]
	},

	/*
	 * STEP 1 - UPLOAD SAMPLE BIMPK
	 *
	 * When prompted select the 'General Medical - Architecture.bimpk' included with the test files
	*/
  	async uploadBimpk(input, libraries, ctx, callback) {

		const { IafFileSvc } = libraries.PlatformApi
		const { IafLocalFile } = libraries.UiUtils

		let fileUploadResults = []

		let files = await IafLocalFile.selectFiles({ multiple: false, accept: ".bimpk" })

		// we will provide an onComplete callback to the upload function so that we can resolve
		// our deferred Promises once the upload completes
		// we'll have this print to the console and the scripts callback
		// you will see the scripts callback content in the script results when the script
		// has completed running
		// the callback you provide for onComplete will be passed the created file record in the file service
		function onUploadComplete(deferredResolve, file) {
			let message = file._name + ' COMPLETE'
			console.log(message)
			callback(message)
			fileUploadResults.push(file)
			deferredResolve()
		}

		// we will provide an onProgress callback as well to the upload function
		// we'll have this print to the console and the scripts callback
		// you will see the scripts callback content in the script results when the script
		// has completed running
		// the callback you provide for onProgress will be passed the bytes uplaoded so far the total bytes
		function onUploadProgress(bytesUploaded, bytesTotal, file) {
			let percentComplete = (bytesUploaded/bytesTotal * 100).toFixed(1)
			let message = file.name + ': ' + percentComplete
			console.log(message)
			callback(message)
		}

		// we will provide an onError callback as well to the upload function
		// we'll have this print to the console and the scripts callback
		// you will see the scripts callback content in the script results when the script
		// has completed running
		function onUploadError(deferredReject, error, file) {
			let message = file.name + ': ERROR' + error
			console.log(message)
			callback(message)
			deferredReject(error)
		}

		// upload each file async
		let uploadPromises = [] // a collection of deferred promises, 1 for each file we upload
		for (const file of files) {
			// since the file will be uploaded async we create a Promise and only resolve it once the file
			// has been 100% uploaded, making sure that the script does not complete before that.
			// We will pass the deferred resolve method to the onUploadComplete callback
			let deferredResolve, deferredReject
			uploadPromises.push(new Promise((resolve, reject) => {
				deferredResolve = resolve
				deferredReject = reject
			}))

			try {

				// upload the file using resumable upload which can handle interrupts in network and which
				// will allow partial file uploads that can be completed at a later point in time
				//
				// Params:
				// 1. the file Stream, Buffer, or File to upload
				// 2. the project _namespaces to which to upload the files
				// 3. the parent folders for the file, if none are provided the root folder for the project will be used
				// 4. the tags to apply to the file
				// 5. the user's ctx uplaoding the files
				// 6. an options object containing
				// 	the filename for the file if not provided on the file
				//		onProgress, onComplete, and onError options callbacks
				//
				// We will upload one file at a time, but you can do parallel uploads by removing await
				// and throttling the number of uploads you allow at one time
				await IafFileSvc.addFileResumable(file.fileObj, ctx._namespaces, [], [], ctx, {
						filename: file.name,
						onProgress: (bytesUploaded, bytesTotal) => onUploadProgress(bytesUploaded, bytesTotal, file),
						onComplete: (file) => onUploadComplete(deferredResolve, file), // onComplete will be passed the file record in the file service
						onError: (error) => onUploadError(deferredReject, error, file)
					}
				)
			} catch(e) {
				console.log(e)
				deferredReject(e)
			}
		}

		// wait for the onUploadSuccess callbacks to resolve all our deferred Promises then return from the script
		return await Promise.all(uploadPromises).then(() => {
			return fileUploadResults
    	})

 	},

	/*
	 * STEP 2 - IMPORT THE SAMPLE BIMPK
	 *
	*/
	async importLatestModelVersion(input, libraries, ctx, callback) {

		const { IafFileSvc, IafDataSource } = libraries.PlatformApi
		const { IafScriptEngine } = libraries

		// get import orchestrator
		let datasources = await IafScriptEngine.getDatasources({_namespaces: ctx._namespaces}, ctx)
    	let importOrch = datasources.find(d => d._userType === "bimpk_importer")

		// get latest version of the smaple bimpk
		const fileSearchCriteria = {
			_name: 'General Medical - Architecture.bimpk',
			_namespaces: ctx._namespaces,
			_parents: 'root'
		}

		let bimpkFile = (await IafFileSvc.getFiles(fileSearchCriteria, ctx))._list[0]

		// create the orchestrator run request
		let datasourceRunRequest = {
			orchestratorId: importOrch.id, // _id of the orchestrator to run
			_actualparams: [{ // an array of the parameters we want to pass to each step when the orchestrator runs
			  sequence_type_id: importOrch.orchsteps[0]._compid, // this is how we identify the step receiving the parameters
			  params: {
					// params to pass to the import orchestrator
					filename: bimpkFile._name.split('.')[0],
					_fileId: bimpkFile._id,
					_fileVersionId: bimpkFile._tipId
			  }
			}]
		 }
	
		 // run the orchestrator - this returns an orchestrator run item that indicates the orchestrator has been 'QUEUED'
		 const orchRun = await IafDataSource.runOrchestrator(importOrch.id, datasourceRunRequest, ctx)
		 console.log(orchRun._status)
		 callback(orchRun._status)
	
		 // now we poll until the orchestrator status is either 'COMPLETED' or 'ERROR'
		 let finalOrchStatus = await pollOrchStatus(IafDataSource, orchRun, 'COMPLETED', callback, ctx)

		return { finalOrchStatus }
	},

	/*
	 * STEP 3 - MODEL COMPOSITE ITEM, COLLECTIONS, AND ITEMS
	 * 
	 * modelCompositeItem contains the model NamedCompositeItem.
	 * Notice the following:
	 * 1. The _userType is 'bim_model_version', all Model NamedCompositeItems will have this _userType
	 * 2. The ModelCompositeItem can be versioned. The _tipVersion and _tipId give you the information for the latest
	 * 	version of the Model NamedCompositeItem, which is also returned by default in the _versions array. If you look at
	 * 	version in the _versions array you can find the _userAttributes.bimpk contains the fileId and fileVersionId used
	 * 	during the import.
	 * 
	 * collectionsModelCompositeItem contains all the NamedUserCollection info for the NamedCompositeItem.
	 * Each NamedUserCollection also contains an items array with the first items in the NamedUserCollection so you can
	 * explore what the final imported data looks like.
	 * 1. NamedUserCollection _userType rvt_elements contains all the items that represent each element in the model. This
	 * 	includes things like Levels, and Spaces, and Doors. If you look at the items you can there is not much information
	 * 	on these items, as all of their properties are stored in other collections
	 * 2. NamedUserCollection _userType rvt_element_props contains the instance properties, or the properties which only
	 * 	apply to a single element. If you look at the items you can see that each item contains an array of the
	 * 	element properties and values for a specific element
	 * 3. NamedUserCollection _userType rvt_type_elements contains the type properties which apply to multiple elements, or
	 * 	all elements of the type which the item represents. If you look at the items you can see each contains the name
	 * 	of the type and an array of the properties and values associated to the that type
	 * 4. NamedUserCollection _userType bim_model_geomresources contains items with information about the files which contain
	 * 	the graphics data for the model in the File Service. If you look at the items, you can see each contains a filename,
	 * 	fileId, and fileVersionId of a file in the File Service. The Graphics Service will use this information to stream
	 * 	graphics to the IafViewer component
	 * 5. NamedUserCollection _userType bim_model_geomviews contains items with information about the types of graphics available
	 * 	for the model. Here you can find a reference to the model's 3D view
	 * 
	*/
	async queryModelCompositeItem(input, libraries, ctx) {

		const { IafItemSvc } = libraries.PlatformApi

		// get latest version of the Model NamedCompositeItem
		const res = await IafItemSvc.getNamedUserItems({
			query: {
				_userType: 'bim_model_version',
				_itemClass: 'NamedCompositeItem',
			}
		}, ctx, {})
	
		const modelCompositeItem = res._list.find(mc => mc._name === 'General Medical - Architecture')

		// get all the NamedUserCollection in the Model NamedCompositeItem
		let collectionsModelCompositeItem = (await IafItemSvc.getRelatedInItem(modelCompositeItem._userItemId, {}, ctx))._list

		// for each NamedUserCollection get the first 5 items in the collection
		for (const collection of collectionsModelCompositeItem) {
			collection.items = (await IafItemSvc.getRelatedItems(collection._userItemId, {}, ctx, {page: {_pageSize: 5}}))._list
		}

		return { modelCompositeItem, collectionsModelCompositeItem }

	},

	/*
	 * Utility to reset your project
	 *
	 * This is a handy reset utility that will delete all bimpks and model composite items from your project.
	 * Use this if you need to reset your project in order to rerun the steps in this module.
	 * 
	 * !!!!! USE WITH CAUTION: This script will delete all bimpks and model composite items from your project!
	*/
	async reset(input, libraries, ctx) {

		const { IafItemSvc, IafFileSvc } = libraries.PlatformApi

		const fileSearchCriteria = {
			_name: '.*bimpk',
			_namespaces: ctx._namespaces,
			_parents: 'root'
		}

		let bimpkFiles = (await IafFileSvc.getFiles(fileSearchCriteria, ctx))._list

		for ( const file of bimpkFiles) {
			await IafFileSvc.deleteFile(file._id, ctx)
		}

		let postDeleteFiles = await IafFileSvc.getFiles(fileSearchCriteria, ctx)
	
		const res = await IafItemSvc.getNamedUserItems({
			query: {
				_userType: 'bim_model_version',
				_itemClass: 'NamedCompositeItem',
			}
		}, ctx, {})

		for (const modelComp of res._list) {
			await IafItemSvc.deleteNamedUserItem(modelComp._id, ctx)
		}

		const postDeleteRes = await IafItemSvc.getNamedUserItems({
			query: {
				_userType: 'bim_model_version',
				_itemClass: 'NamedCompositeItem',
			}
		}, ctx, {})

		const collections = await IafItemSvc.getNamedUserItems({
			query: {
				_userType: {$in: ['rvt_elements', 'rvt_element_props', 'rvt_type_elements', 'bim_model_geomresources', 'bim_model_geomviews', 'data_cache']},
				_itemClass: 'NamedUserCollection',
			}
		}, ctx, {})

		for (const coll of collections._list) {
			await IafItemSvc.deleteNamedUserItem(coll._id, ctx)
		}

		const postCollections = await IafItemSvc.getNamedUserItems({
			query: {
				_userType: {$in: ['rvt_elements', 'rvt_element_props', 'rvt_type_elements', 'bim_model_geomresources', 'bim_model_geomviews', 'data_cache']},
				_itemClass: 'NamedUserCollection',
			}
		}, ctx, {})


		return {bimpkFiles, postDeleteFiles, modelComps: res._list, postDeleteRes, postCollections}

	}

}

export default modelImportModule