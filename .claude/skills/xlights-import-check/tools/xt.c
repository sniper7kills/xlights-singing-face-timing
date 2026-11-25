/*
 * xt - minimal XTEST driver for driving a GUI app from the terminal.
 * See SKILL.md next to this file for setup, workflow and gotchas.
 *
 * build:
 *   gcc -O2 -o xt xt.c $(pkg-config --cflags --libs x11 xtst cairo)
 *
 * usage:
 *   ./xt wait  <name>            wait up to 20s for the window, print geometry
 *   ./xt geom  <name>            print window id, absolute position, size
 *   ./xt names                   list all windows: name, size, viewable
 *   ./xt click <name> <x> <y>    click at window-relative coordinates
 *   ./xt key   <name> <keysym>   send a key: F11, Escape, space, Up, r, ...
 *   ./xt shot  <name> <out.png>  screenshot that window
 *   ./xt rootshot <out.png>      screenshot the root window (best effort)
 *   ./xt sleep <ms>              sleep
 *
 * Two things here are load-bearing, do not "simplify" them:
 *   - commands that need no window (sleep, names, rootshot) are handled BEFORE
 *     the window lookup, otherwise they fail with "window not found" and become
 *     silent no-ops;
 *   - find() picks the LARGEST VIEWABLE name match, because GTK also creates a
 *     10x10 group-leader window carrying the same name.
 */
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>
#include <X11/extensions/XTest.h>
#include <X11/XKBlib.h>
#include <X11/keysym.h>
#include <X11/keysym.h>
#include <cairo/cairo.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

static Display *d;

static char *wname(Window w){
  Atom nwn=XInternAtom(d,"_NET_WM_NAME",False), ut=XInternAtom(d,"UTF8_STRING",False);
  Atom type; int fmt; unsigned long n,after; unsigned char *p=NULL;
  if(XGetWindowProperty(d,w,nwn,0,1024,False,ut,&type,&fmt,&n,&after,&p)==Success&&p)
    return (char*)p;
  char *wn=NULL;
  if(XFetchName(d,w,&wn)&&wn) return wn;
  return NULL;
}
/* pick the LARGEST mapped window whose name matches: skips the 10x10
   group-leader window GTK also creates */
static Window best; static long best_area;
static void find_all(Window w, const char *name, int depth){
  char *n=wname(w);
  XWindowAttributes a; int ok=XGetWindowAttributes(d,w,&a);
  if(n){
    int hit=strstr(n,name)!=NULL;
    if(depth>=0&&getenv("XT_DUMP"))
      printf("  %*swin 0x%lx %dx%d+%d+%d or=%d %s '%s'\n",depth*2,"",w,
        ok?a.width:0,ok?a.height:0,a.x,a.y,a.override_redirect,(ok&&a.map_state==IsViewable)?"viewable":"hidden",n);
    if(hit&&ok&&a.map_state==IsViewable){
      long area=(long)a.width*a.height;
      if(area>best_area){best_area=area;best=w;}
    }
    XFree(n);
  }
  Window rr,parent,*kids=NULL; unsigned cnt;
  if(!XQueryTree(d,w,&rr,&parent,&kids,&cnt)) return;
  for(unsigned i=0;i<cnt;i++) find_all(kids[i],name,depth<0?-1:depth+1);
  if(kids)XFree(kids);
}
static Window find(Window w, const char *name, int depth){
  best=0; best_area=0; find_all(w,name,depth); return best;
}
static Window waitfor(const char*name,int secs){
  Window root=DefaultRootWindow(d);
  for(int i=0;i<secs*10;i++){ Window w=find(root,name,-1);
    if(w){XWindowAttributes a; XGetWindowAttributes(d,w,&a);
          if(a.width>100&&a.height>100) return w;}
    usleep(100000); }
  return 0;
}
static int shot(Window w,const char*file){
  XWindowAttributes a; XGetWindowAttributes(d,w,&a);
  XImage *im=XGetImage(d,w,0,0,a.width,a.height,AllPlanes,ZPixmap);
  if(!im){fprintf(stderr,"XGetImage failed\n");return 1;}
  cairo_surface_t *s=cairo_image_surface_create(CAIRO_FORMAT_RGB24,a.width,a.height);
  unsigned char *dst=cairo_image_surface_get_data(s);
  int stride=cairo_image_surface_get_stride(s);
  for(int y=0;y<a.height;y++) for(int x=0;x<a.width;x++){
    unsigned long p=XGetPixel(im,x,y);
    unsigned char *q=dst+y*stride+x*4;
    q[0]=p&0xff; q[1]=(p>>8)&0xff; q[2]=(p>>16)&0xff; q[3]=0xff;
  }
  cairo_surface_mark_dirty(s);
  cairo_status_t st=cairo_surface_write_to_png(s,file);
  printf("shot %dx%d -> %s (%s)\n",a.width,a.height,file,cairo_status_to_string(st));
  XDestroyImage(im); cairo_surface_destroy(s);
  return st!=CAIRO_STATUS_SUCCESS;
}
int main(int argc,char**argv){
  d=XOpenDisplay(NULL); if(!d){fprintf(stderr,"no display\n");return 1;}
  Window root=DefaultRootWindow(d);
  const char *cmd=argc>1?argv[1]:"";
  if(!strcmp(cmd,"names")){ setenv("XT_DUMP","1",1); find(root,"\x01\x02nope",0); return 0; }
  if(!strcmp(cmd,"rootshot")) return shot(root,argv[2]);
  if(!strcmp(cmd,"pointer")){Window r,c;int rx,ry,wx,wy;unsigned m;XQueryPointer(d,root,&r,&c,&rx,&ry,&wx,&wy,&m);printf("pointer %d,%d child=0x%lx\n",rx,ry,c);return 0;}
  if(!strcmp(cmd,"sleep")){ usleep(atoi(argv[2])*1000); return 0; }
  const char *nm=argc>2?argv[2]:"FLIR One";
  Window w=!strncmp(nm,"0x",2)?(Window)strtoul(nm,NULL,16):waitfor(nm, !strcmp(cmd,"wait")?20:3);
  if(!w){fprintf(stderr,"window '%s' not found\n",nm);return 2;}
  XWindowAttributes a; Window child; int ax,ay;
  XGetWindowAttributes(d,w,&a);
  XTranslateCoordinates(d,w,root,0,0,&ax,&ay,&child);
  if(!strcmp(cmd,"wait")||!strcmp(cmd,"geom")){
    printf("win=0x%lx abs=%d,%d size=%dx%d\n",w,ax,ay,a.width,a.height); return 0;}
  if(!strcmp(cmd,"shot")) return shot(w,argv[3]);
  if(!strcmp(cmd,"click")){
    int x=ax+atoi(argv[3]), y=ay+atoi(argv[4]);
    if(!getenv("XT_NOFOCUS")){XRaiseWindow(d,w); XSetInputFocus(d,w,RevertToParent,CurrentTime); XFlush(d); usleep(250000);}
    XTestFakeMotionEvent(d,-1,x,y,0); XFlush(d); usleep(150000);
    XTestFakeButtonEvent(d,1,True,0); XFlush(d); usleep(80000);
    XTestFakeButtonEvent(d,1,False,0); XFlush(d); usleep(150000);
    printf("clicked %d,%d\n",x,y); return 0;
  }
  int nofocus = getenv("XT_NOFOCUS")!=NULL;
  if(!strcmp(cmd,"rclick")||!strcmp(cmd,"dclick")||!strcmp(cmd,"move")){
    int x=ax+atoi(argv[3]), y=ay+atoi(argv[4]);
    if(!nofocus){XRaiseWindow(d,w); XSetInputFocus(d,w,RevertToParent,CurrentTime); XFlush(d); usleep(250000);}
    XTestFakeMotionEvent(d,-1,x,y,0); XFlush(d); usleep(150000);
    if(!strcmp(cmd,"move")){printf("moved %d,%d\n",x,y);return 0;}
    int b=!strcmp(cmd,"rclick")?3:1, n=!strcmp(cmd,"dclick")?2:1;
    for(int i=0;i<n;i++){
      XTestFakeButtonEvent(d,b,True,0); XFlush(d); usleep(60000);
      XTestFakeButtonEvent(d,b,False,0); XFlush(d); usleep(60000);
    }
    usleep(150000);
    printf("%s %d,%d\n",cmd,x,y); return 0;
  }
  if(!strcmp(cmd,"key")){
    // A key name, with optional modifiers: ctrl+l, shift+Tab, alt+F4.
    char buf[256]; strncpy(buf,argv[3],255); buf[255]=0;
    KeyCode mods[4]; int nm2=0; char *p=buf, *plus;
    while((plus=strchr(p,'+'))&&plus[1]){ *plus=0;
      const char*m=!strcmp(p,"ctrl")?"Control_L":!strcmp(p,"shift")?"Shift_L":!strcmp(p,"alt")?"Alt_L":p;
      mods[nm2++]=XKeysymToKeycode(d,XStringToKeysym(m)); p=plus+1; }
    KeySym ks=XStringToKeysym(p);
    if(ks==NoSymbol){fprintf(stderr,"bad keysym %s\n",p);return 3;}
    KeyCode kc=XKeysymToKeycode(d,ks);
    if(!nofocus){XRaiseWindow(d,w); XSetInputFocus(d,w,RevertToParent,CurrentTime); XFlush(d); usleep(250000);}
    for(int i=0;i<nm2;i++){XTestFakeKeyEvent(d,mods[i],True,0);XFlush(d);usleep(30000);}
    XTestFakeKeyEvent(d,kc,True,0); XFlush(d); usleep(80000);
    XTestFakeKeyEvent(d,kc,False,0); XFlush(d); usleep(30000);
    for(int i=nm2-1;i>=0;i--){XTestFakeKeyEvent(d,mods[i],False,0);XFlush(d);usleep(30000);}
    usleep(120000);
    printf("key %s\n",argv[3]); return 0;
  }
  if(!strcmp(cmd,"type")){
    // Types ASCII text into the focused control.
    if(!nofocus){XRaiseWindow(d,w); XSetInputFocus(d,w,RevertToParent,CurrentTime); XFlush(d); usleep(250000);}
    KeyCode shift=XKeysymToKeycode(d,XK_Shift_L);
    for(const char*c=argv[3];*c;c++){
      KeySym ks=(KeySym)(unsigned char)*c;
      KeyCode kc=XKeysymToKeycode(d,ks);
      if(!kc){fprintf(stderr,"no keycode for %c\n",*c);return 3;}
      int needShift = XkbKeycodeToKeysym(d,kc,0,0)!=ks;
      if(needShift){XTestFakeKeyEvent(d,shift,True,0);XFlush(d);usleep(10000);}
      XTestFakeKeyEvent(d,kc,True,0); XFlush(d); usleep(20000);
      XTestFakeKeyEvent(d,kc,False,0); XFlush(d); usleep(20000);
      if(needShift){XTestFakeKeyEvent(d,shift,False,0);XFlush(d);usleep(10000);}
    }
    printf("typed %zu chars\n",strlen(argv[3])); return 0;
  }
  fprintf(stderr,"usage: xt wait|geom|names|click|key|shot|rootshot|sleep [win] [args]\n");
  return 1;
}
