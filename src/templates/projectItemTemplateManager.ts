'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectItemTemplateCategory } from './projectItemTemplateCategory';
import { ProjectItemTemplate } from './projectItemTemplate';
import { StringReplacement } from '../helpers/stringReplacement';
import { ProjectItemTemplateRunSettings } from './projectItemTemplateRunSettings';
import { StringHelper } from '../helpers/stringHelper';

export class ProjectItemTemplateManager {
    _rootCategory : ProjectItemTemplateCategory;
    protected _templateFolders : string[];
    protected _context : vscode.ExtensionContext;
    protected _wizards : vzFileTemplates.IProjectItemWizard[];
    protected _selectedTemplatePath : string;

    constructor(context : vscode.ExtensionContext) {
        this._selectedTemplatePath = "";
        this._context = context;
        this._rootCategory = new ProjectItemTemplateCategory();        
        this._templateFolders = [];
        this._wizards = [];

        //add main project items templates path
        this._templateFolders.push(context.asAbsolutePath('templates'));
        //add user templates folders
        let userFolders : string[] | undefined = vscode.workspace.getConfiguration('vzfiletemplates').get('userTemplatesFolders');
        if ((userFolders) && (userFolders.length > 0)) {
            for (let idx = 0; idx < userFolders.length; idx++) {
                if ((userFolders[idx]) && (userFolders[idx] != ""))
                    this._templateFolders.push(userFolders[idx]);
            }
        }
    }

    setSelectedTemplate(template : ProjectItemTemplate) {
        this._selectedTemplatePath = template.templateFilePath;
    }

    registerWizard(wizard : vzFileTemplates.IProjectItemWizard) {
        this._wizards.push(wizard);
    }

    registerTemplatesFolder(folderPath : string) {
        this._templateFolders.push(folderPath);
    }

    loadTemplates() {
        this._rootCategory = new ProjectItemTemplateCategory();
        for (let i=0; i<this._templateFolders.length;i++) {
            this.loadTemplatesFromFolder(this._templateFolders[i]);
        }
    }

    protected loadTemplatesFromFolder(sourcePath : string) {
        const fs = require('fs');     
        // resolve path of each item, stored in "vzfiletemplates.userTemplatesFolders" if it is relative
        // Now all paths could be absolute or relative to workspace
        if(!path.isAbsolute(sourcePath)){
            if ((vscode.workspace.workspaceFolders) && (vscode.workspace.workspaceFolders.length > 0))
                sourcePath = path.resolve(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, sourcePath));
        }   

        if (!fs.existsSync(sourcePath))
            return;

        let dirContent : string[] = fs.readdirSync(sourcePath);

        //process sub directories
        if (dirContent) {
            for (let i=0; i<dirContent.length;i++) {
                let itemPath : string = path.join(sourcePath, dirContent[i]);
                let itemStat = fs.statSync(itemPath);
                if (itemStat.isDirectory())
                    this.loadTemplatesFromFolder(itemPath);
            }
        }

        //load template files
        let templateFilePath = path.join(sourcePath, "template.json");
        if (fs.existsSync(templateFilePath)) {
            let template : ProjectItemTemplate = new ProjectItemTemplate();
            try{
                if (template.loadFromFile(templateFilePath)) {
                    template.selected = (this._selectedTemplatePath == template.templateFilePath);
                    this.addTemplate(template);
                }
            }
            catch (e) {                        
            }
        }

        //assign ids
        this._rootCategory.assignCategoryIds(1);
        this._rootCategory.assignItemsIds(1);
    }

    addTemplate(template : ProjectItemTemplate) {
        let templateCategory : ProjectItemTemplateCategory = this.findCategoryByPath(template.category);
        templateCategory.items.push(template);
        if (template.selected)
            templateCategory.selected = true;
    }

    protected findCategoryByPath(categoryPath : string) : ProjectItemTemplateCategory {
        if (!categoryPath)
            categoryPath = "Undefined";

        let names : string[] = categoryPath.split("/");
        let retVal = this._rootCategory;
        for (let i=0; i<names.length;i++) {
            retVal = retVal.findOrCreateChildCategory(names[i]);
        }

        return retVal;
    }

    findTemplate(id : number) : ProjectItemTemplate | undefined {
        return this._rootCategory.findTemplate(id);
    }

    runTemplate(destPath : string, template : ProjectItemTemplate, inputName : string) : boolean {       
        //prepare list of variables
        let replList : StringReplacement[] = [];
        let name : string = path.parse(inputName).name;

        replList.push(new StringReplacement("\\$fileinputname$", "$fileinputname$"));
        replList.push(new StringReplacement("\\$itemname$", "$itemname$"));
        replList.push(new StringReplacement("\\$safeitemname$", "$safeitemname$"));       

        replList.push(new StringReplacement("$fileinputname$", inputName));
        replList.push(new StringReplacement("$itemname$", name));
        replList.push(new StringReplacement("$safeitemname$", StringHelper.toSafeName(name)));       
        
        let templateSettings = new ProjectItemTemplateRunSettings(destPath, replList); 

        if ((template.wizardName) && (template.wizardName != "")) {
            let wizard : vzFileTemplates.IProjectItemWizard | undefined = this.getWizard(template.wizardName);
            if (!wizard) {
                vscode.window.showErrorMessage("Wizard '" + template.wizardName + "' not found.");
                return false;
            }
            wizard.run(template, templateSettings);
        } else {
            template.run(templateSettings);
        }
        return true;
    }

    protected getWizard(name : string) : vzFileTemplates.IProjectItemWizard | undefined {
        for (let i=0; i<this._wizards.length; i++) {
            if (this._wizards[i].getName() == name)
                return this._wizards[i];
        }
        return undefined;
    }

}
