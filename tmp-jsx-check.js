const fs=require('fs');
const parser=require('@babel/parser');
const traverse=require('@babel/traverse').default;
const glob=require('glob');
const files=glob.sync('app/**/*.tsx');
const issues=[];
for (const file of files) {
  const code=fs.readFileSync(file,'utf8');
  let ast;
  try {
    ast=parser.parse(code,{sourceType:'module',plugins:['typescript','jsx']});
  } catch(err) {
    console.error('parse fail',file,err.message);
    continue;
  }
  traverse(ast,{
    JSXText(pathNode){
      const raw=pathNode.node.value;
      if(!raw) return;
      const value=raw.replace(/[\s\n]+/g,' ').trim();
      if(!value) return;
      let parent=pathNode.parentPath;
      while(parent && parent.node && parent.node.type!=='JSXElement'){
        parent=parent.parentPath;
      }
      if(!parent || parent.node.type!=='JSXElement') return;
      const opening=parent.node.openingElement;
      let name=opening.name;
      let nameStr='';
      if(name.type==='JSXIdentifier') nameStr=name.name;
      else if(name.type==='JSXMemberExpression') nameStr=name.property.name;
      if(nameStr==='Text') return;
      issues.push({file,line:pathNode.node.loc.start.line,text:value,parent:nameStr});
    }
  });
}
console.log(JSON.stringify(issues,null,2));
