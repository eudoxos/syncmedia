from docutils import nodes
from docutils.parsers.rst import Directive, directives

class syncmedia_node(nodes.General, nodes.Element):
    def __init__(self,uri,opts):
        super().__init__()
        self['uri']=uri
        for opt in opts: self[opt]=opts[opt]


class SyncMediaDirective(Directive):
    required_arguments=1
    final_argument_whitespace=True # allow spaces in URLs
    has_content=False
    option_spec={
        'show': directives.flag,
        'duration': directives.unchanged,
        'offset': directives.unchanged,
    }
    def run(self):
        for opt in ('duration','offset'):
            if opt not in self.options: continue
            self.options[opt]=float_hms_int(self.options[opt])
        return [syncmedia_node(self.arguments[0],self.options)]

def float_hms_int(s):
    if '.' in s: return float(s)
    elif ':' in s: return hms2ss(s)
    else: return int(s)
def hms2ss(hms):
    tt=[int(s) for s in hms.split(':')]
    if len(tt)==2: return 60*tt[0]+tt[1]
    elif len(tt)==3: return 3600*tt[0]+60*tt[1]+tt[2]
    else: raise ValueError(f"Unable to parse timestamp '{hms}' (as h:m:s or m:s).")
def ss2hms(ss):
    if ss<3600: return f'{ss//60:02}:{ss%60:02}'
    return f'{ss//3600}:{(ss%3600)//60:02}:{ss%60:02}'


def sync_timestamp_role(name,rawtext,text,lineno,inliner,options={},content=[]):
    try: ss=hms2ss(text)
    except ValueError as e:
        msg=inliner.reporter.error(e.message)
        return [inliner.problematic(rawtext,rawtext,msg)],[msg]
    app=inliner.document.settings.env.app
    node=nodes.reference(rawtext,text,internal=False,classes=['syncmedia'],refuri=text)
    return [node],[]

def process_syncmedia_nodes(app, doctree, fromdocname):
    def syncmedia_or_sync(n):
        return isinstance(n,syncmedia_node) or (isinstance(n,nodes.reference) and 'syncmedia' in n['classes'])
    syncmedia_last_node=None
    for node in doctree.findall(condition=syncmedia_or_sync):
        if isinstance(node,syncmedia_node):
            syncmedia_last_node=node
            continue
        assert isinstance(node,nodes.reference)
        # print(syncmedia_last_uri,node['refuri'])
        if syncmedia_last_node is None: raise RuntimeError(f'{fromdocname} has no syncmedia directive prior to sync timestamp (line {node.line}).')
        playerTimeSec=str(int(hms2ss(node['refuri'])+syncmedia_last_node.get('offset',0)))
        node['refuri']=app.config.syncmedia_prefix+syncmedia_last_node['uri']+'#t='+playerTimeSec
    if app.config.syncmedia_hide:
        class syncmedia_remover(object):
            def __init__(self,document): self.document=document
            def dispatch_visit(self,n):
                if syncmedia_or_sync(n): n.parent.remove(n)
        doctree.walk(syncmedia_remover(doctree))

def visit_node_noop(self,node): raise nodes.SkipNode
def depart_node_noop(self,node): pass
def visit_syncmedia_node_latex(self,node):
    if not 'show' in node: raise nodes.SkipNode
    uri=(self.config.syncmedia_prefix+node['uri'])
    self.body.append(r'''\begin{lrbox}{\syncmediaqr}\qrcode[height=2.5\baselineskip]{%s}\end{lrbox}\lettrine[lraise=0.2]{\usebox{\syncmediaqr}}{} \url{%s}\vskip1.5\baselineskip\par'''%(uri,uri))
def visit_syncmedia_node_html(self,node):
    if not 'show' in node: raise nodes.SkipNode
    atts={'class':'syncmedia reference external','href':f'{node["uri"]}#t={node.get("offset",0)}'}
    self.body.append(self.starttag(node,'div','',**{'class':'syncmedia-show float-start'}))
    self.body.append(self.starttag(node,'a','',**atts))
    self.body.append('🔊')
def depart_syncmedia_node_html(self,node):
    self.body.append('</div>')
    self.depart_reference(node)

def visit_syncmedia_node_text(self,node): pass

_jss,_csss=['syncmedia.js',],['syncmedia.css',]
# https://github.com/sphinx-doc/sphinx/issues/1379#issuecomment-809006086
def copy_asset_files(app,exc):
    from sphinx.util.fileutil import copy_asset
    import os.path
    if exc: return # build failed
    static=os.path.dirname(__file__)+'/static/'
    for asset in _jss+_csss:
        copy_asset(static+asset, os.path.join(app.outdir, '_static'))


def setup(app):
    app.add_config_value('syncmedia_prefix', '', 'html',types=[str])
    app.add_config_value('syncmedia_hide', False, 'html',types=[bool])
    app.add_role('sync',sync_timestamp_role)
    app.add_directive('syncmedia',SyncMediaDirective)
    app.add_node(syncmedia_node,
        html=(visit_syncmedia_node_html,depart_syncmedia_node_html),
        latex=(visit_syncmedia_node_latex,depart_node_noop),
        text=(visit_syncmedia_node_text,depart_node_noop),
    )
    app.connect('doctree-resolved', process_syncmedia_nodes)
    app.connect('build-finished', copy_asset_files)
    # this must be done before copy_asset files, when the build is already finished and js/css would not be mentioned in the HTML file
    for js in _jss: app.add_js_file(js)
    for css in _csss: app.add_css_file(css)

    return dict(parallel_read_safe=True)
