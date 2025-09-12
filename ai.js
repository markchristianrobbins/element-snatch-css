


const upwardPathTask = `
	on ctrl + shift middle click copy present a menu  of the elements above like in ctrl + middle click of the plugin.
	hovering highlights the element
	clicking copies the css upward path to clipboard with immediate decendents indicated - '>'
	also added is without '>' to indicate any decendents
`;

const upwardPathTask2 = `
deficient:
need _openMenuForPath Ctrl+Shift and _openMenuForCss Ctrl, which is
                    await this._css(el, {
                        includeNthChild: false,
                        indent: "  ",
                        maxDepth: Infinity,
                        maxNodes: 5000
                    });
`;


const newHighlightTask= `
this file works.
please preserve comments and jsdoc. you can add to them though.
for a highligher change to creating a div and appending it to body, then reusing it to indicate the highlighted element. dispose of it when menu is closed.
position the new highlighter div using getBoundingClientRect of the element to be highlighted.
make the highlighter motion animated with ease-in-out css transition.
the hightlight will have a dotted border of 2px and a semi-transparent background color.
the border color will be a hue-rotation. slowly changing color.
`;
const highlightFixTask= `
this file works.
change the style of the hightlight to a dotted border of 2px and a semi-transparent black background
 color.
the border color will be a hue-rotation. slowly changing color.
the highlighted element will have its contrast increased.
`;

const noticesAndMenuTitleTasks= `
this file works.
control the life of my Notice calls by creating a Noticer class uses a timeout to dispose of the Notice after a set time.
the Noticer class has a method show(message:string, timeout?:number) that creates a Notice with the message and disposes of it after the timeout (default 3 seconds).
the Noticer class has a method dispose() that disposes of the current Notice if it exists.
the Noticer class has a method isActive() that returns true if there is a current Notice.
the Noticer class has a static method getNoticers() that returns an array of all Noticer instances.
add a title attribute to the menu items for _openMenuForPath that shows the paths that will result for that item.
add a 'title' menu item that shows the purpose of the menu. this item is not selectable.
`;
const menuTitleTasks= `
this file works.
the popup menu for _openMenuForPath and _openMenuForCss needs to have title item at the top that describes the purpose of the menu.
the title item is not selectable.
the menu items need a title attribute that shows the paths that will result for that item.
`;
const _5= `
`;
const _6= `
`;
const _7= `
`;



// c:\Users\markc\AppData\Roaming\Code\User