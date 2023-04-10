# Model Bimpk Import Module

The Model BIMPK Import Module provides the base scripts to enable your twinit projects
to import model bimpk files.

## License

MIT No Attribution License
https://opensource.org/license/mit-0/

Copyright 2023 Twinit

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and 
associated documentation files (the “Software”), to deal in the Software without restriction, including 
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
copies of the Software, and to permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED 
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL 
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF 
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
DEALINGS IN THE SOFTWARE.

## Setting Up Your Project

Follow the steps below to enable model bimpk file import in your project.

If using vscode:

1. Sign in to the TWINIT.DEV extension
2. Expand your project and expand the Scripts node in the tree
3. Right click on the Scripts node and click 'Create New Script'
4. For Script Name enter 'Model Import Setup' or another name as you would like
5. Enter a description, Short Name, and User Type for the 'Model Import Setup' script
6. Open the newly created script and copy and paste the content 'src/vscode/Setup Model Import.mjs' into it
7. Save and then right click on the script and select 'Commit to New Version'
8. Reopen the script you just committed
9. Right click and select 'Create Model Import Orchestrator'. When prompted select the 'import_helper.mjs' file

## Testing Your Project

Follow the steps below to test that model bimpk import has been correctly enabled in your project.

1. Sign in to the TWINIT.DEV extension
2. Expand your project and expand the Scripts node in the tree
3. Right click on the Scripts node and click 'Create New Script'
4. For Script Name enter 'TEST Model Import' or another name as you would like
5. Enter a description, Short Name, and User Type for the 'TEST Model Import' script
6. Open the newly created script and copy and paste the content of 'test/vscode/Test Scripts.mjs' into it
7. Save and then right click on the script and select 'Commit to New Version'
8. Reopen the script you just committed
9. Right click this script and select 'Step 1 - Upload .bimpk Model File'. When prompted select the 'General Medical - Architecture.bimpk' file included with the test files
10. After the upload script completes right click this script and select 'Step 2 - Import Latest Model Version'. This script will import that latest version of the test .bimpk file. This can be a long runnign process
11. Once the import has completed right click this script and select 'Step 3 - Get Model Composite Item and Related NamedUserCollections'. This script will query the model NamedCompositeItem, the various NamedUserCollections, and the first 5 items in each NamedUserCollection contained in the model data