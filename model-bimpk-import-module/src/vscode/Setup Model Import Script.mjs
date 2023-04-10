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
 * This file can used with the Twinit Visual Studio Code Extension to setup your project to import
 * model bimpk files. This setup script will upload the included 'import_helper.mjs' script to your
 * Twinit project and then create a Datasource Service Orchestrator that can be run to import
 * model bimpks to your project. Be sure to see the test folder for material you can use to ensure
 * your project is correctly setup for model bimpk import.
 * 
 * This module is currently optimized for bimpks produced using Revit, but can be easily
 * customized and enhanced for any source design system.
 * 
 * To use this script:
 *
 * 1. Sign in to the TWINIT.DEV extension
 * 2. Expand your project and expand the Scripts node in the tree
 * 3. Right click on the Scripts node and click 'Create New Script'
 * 4. For Script Name enter 'Model Import Setup' or another name as you would like
 * 5. Enter a description, Short Name, and User Type for the 'Model Import Setup' script
 * 6. Open the newly created script and copy and paste this file into it
 * 7. Save and then right click on the script and select 'Commit to New Version'
 * 8. Reopen the script you just committed
 * 9. Right click and select 'Create Model Import Orchestrator'
 *    When prompted select the 'import_helper.mjs' file
*/

let setupModelImportModule = {

	getRunnableScripts() {
		return [
			{ name: 'Create Model Import Orchestrator', script: 'createOrRecreateImportOrchestrator' },
		]
	},

	async createOrRecreateImportOrchestrator(input, libraries, ctx) {
		const { UiUtils, IafScriptEngine, PlatformApi } = libraries

		// Select supporting_files/import_helper.mjs
		let scriptFiles = await UiUtils.IafLocalFile.selectFiles({ multiple: true, accept: ".js,.mjs" })
		let scriptContents = await UiUtils.IafLocalFile.loadFiles(scriptFiles)

		let scriptItems = [{
			_name: "_orch Model Import Scripts",
			_shortName: "importHelper",
			_description: "Load, Transform and Write Model from BIMPK",
			_userType: "importHelper",
			_namespaces: ctx._namespaces,
			_version: {
				_userData: scriptContents[0]
			}
		}]

		// create the import helper script in the item service which be used by the import orchestrator
		// that we create below
		let createScriptResult = await PlatformApi.IafScripts.create(scriptItems, ctx)

		// look to see if a model import import orcehstrator all ready exists and if so, delete it
		// this will allows us to run this script multiple times if needed to update the orchestrator
		let datasources = await IafScriptEngine.getDatasources({_namespaces: ctx._namespaces}, ctx)
    	let existingImportOrch = datasources.find(d => d._userType === "bimpk_importer")

		if (existingImportOrch) {
			await IafScriptEngine.removeDatasource({orchId: existingImportOrch.id}, ctx)
		}
  
		// create the new import orchestrator config
		const orchestratorConfig = {
			 _name: 'Import BIMPK Models',
			 _description: 'Orchestrator to import model from BIMPK file',
			 _namespaces: ctx._namespaces,
			 _userType: 'bimpk_importer', // _userType we will use to find the orchestrator when we want to run it
			 _params: {
				  tasks: [
						{
							// orchestrator component to get the bimpk from file service
							// and extract locally for the orchestrator to use
							name: 'bimpk_file_extractor',
							_sequenceno: 1
						},
						{
							// orchestrator component that reads the extracted bimpk data
							// and provides to later steps to process
							name: 'bimpk_element_extractor',
							_sequenceno: 2
						},
						{
							// our import helper script that runs uploadBimpk from the script
							// uses the data passed down fromt he previous step
							name: 'default_script_target',
							'_actualparams': {
								'userType': 'importHelper',
								'_scriptName': 'uploadBimpk'
							},
							_sequenceno: 3
						},
						{
							// out import helper script again, but this time running createModelDataCache
							name: 'default_script_target',
							'_actualparams': {
								'userType': 'importHelper',
								'_scriptName': 'createModelDataCache'
							},
							_sequenceno: 4
						},
						{
							// graphics data orchestrator component to process and persist graphics data
							// for the graphics service to stream to the IafViewer components
							name: 'scz_relations_target',
							_sequenceno: 5
						},
						{
							// cleans up all extracted files
							name: 'folder_cleaner_target',
							_sequenceno: 6
						}
				  ]
			 }
		}
  
		// creates the import orchestrator in the Datasources Service
		let createDatasourceOrchResult =  await PlatformApi.IafDataSource.createOrchestrator(orchestratorConfig, ctx)

		return { createScriptResult, createDatasourceOrchResult }
  	}
}

export default setupModelImportModule