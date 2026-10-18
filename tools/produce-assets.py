"""One-time asset authoring. Not called by install or build."""
import json, math, pathlib, subprocess, wave, array
ROOT = pathlib.Path(__file__).resolve().parents[1]
TMP = pathlib.Path('/tmp/kessler'); TMP.mkdir(exist_ok=True)
def run(*args):
    subprocess.run(list(map(str,args)),check=True,stdout=subprocess.DEVNULL)
def pixels(name,size,shader,tool='draw'):
    ops=[]
    for y in range(size):
        for x in range(size):
            c=shader(x+.5,y+.5)
            if c:
                ops.append(dict(op='set_pixel',x=x,y=y,color='#'+''.join(f'{max(0,min(255,round(v))):02x}' for v in c)))
    path=TMP/(name.replace('/','-')+'.json'); path.write_text(json.dumps(ops))
    run(tool,'render','--actions',path,'--out',ROOT/'assets/sprites'/f'{name}.png','--width',size,'--height',size,'--no-layers')
def planet(x,y):
    X=(x-80)/70; Y=(y-80)/70; r=math.hypot(X,Y)
    if r>1:
        if r<1.11: return (70,180,190,80*(1-(r-1)/.11)**2)
        return None
    z=math.sqrt(1-r*r); light=max(.06,(-.5*X-.6*Y+.64*z))
    longitude=math.atan2(X,z); lat=math.asin(Y)
    terrain=math.sin(longitude*9+math.sin(lat*8)*2)+.6*math.sin(longitude*22-lat*13)+.3*math.cos(longitude*47+lat*29)
    base=(189,126,77) if terrain>.45 else (24,74,88)
    clouds=max(0,math.sin(lat*27+longitude*12+math.sin(longitude*8)*2)-.77)*2
    rim=(1-z)**5
    return tuple((v*(1-clouds)+205*clouds)*light+rim*b for v,b in zip(base,(35,70,78)))+(255,)
pixels('planet',160,planet)
colors=[(100,240,204),(255,115,105),(236,216,142),(118,185,255),(213,155,255)]
for kind,col in zip(['widen','narrow','multiball','shield','pierce'],colors):
    def icon(x,y,kind=kind,col=col):
        X=x-12;Y=y-12;r=math.hypot(X,Y)
        if r>11: return None
        border=9<r<10.6
        if kind=='widen': mark=abs(Y)<1.2 and abs(X)<7 or abs(abs(X)- (6-abs(Y)))<1 and abs(Y)<4
        elif kind=='narrow': mark=abs(abs(X)-(2+abs(Y)))<1.3 and abs(Y)<4
        elif kind=='multiball': mark=any(math.hypot(X-a,Y-b)<2.5 for a,b in [(-4,3),(4,3),(0,-4)])
        elif kind=='shield': mark=abs(math.hypot(X,Y+2)-5)<1.4 and Y<3 or abs(abs(X)-(5-Y))<1.4 and 1<Y<6
        else: mark=abs(X+Y*.4)<1.6 and abs(Y)<7 or abs(Y+4+abs(X))<1 and abs(X)<4
        return (*col,255) if mark or border else (15,31,40,245)
    pixels('pods/'+kind,24,icon)
for frame in range(6):
    def ball(x,y,f=frame):
        X=(x-12)/8;Y=(y-12)/8;r=math.hypot(X,Y)
        if r>1:
            return (125,240,246,90*(1-(r-1)/.45)) if r<1.45 else None
        z=math.sqrt(1-r*r); shade=max(.25,-.3*X-.4*Y+.8*z)
        stripe=abs(math.sin(math.atan2(X,z)*2+f*math.pi/3+Y*.8))<.28
        c=(58,151,166) if stripe else (220,252,250)
        return tuple(v*shade for v in c)+(255,)
    pixels('ball/'+str(frame),24,ball,'draw-sheet')
for name,count,speed,life,col in [('burst',48,90,700,'#e8faff@0,#63cdb9@0.35,#d58d5a@0.8,#203949@1'),('spark',18,65,320,'#ffffff@0,#9be8ff@0.4,#315c80@1'),('burnup',36,45,850,'#ffe3ac@0,#ee955e@0.3,#6f3541@1')]:
    cfg=TMP/(name+'.json'); cfg.write_text(json.dumps(dict(width=128,height=128,duration_ms=1200,fps=60,seed=42,actions=str(TMP/(name+'-ops.json')),preview=str(TMP/(name+'.gif')),system=str(ROOT/'assets/particles'/f'{name}.json'))))
    run('particle-2d','--config',cfg,'init')
    run('particle-2d','--config',cfg,'add-emitter','--name','fragments','--shape','point','--x',0,'--y',0,'--burst',count,'--lifetime',life,'--lifetime-spread',life//3,'--speed',speed,'--speed-spread',speed//2,'--cone-angle',180)
    run('particle-2d','--config',cfg,'set-particle','--emitter','fragments','--size-from',.8,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient',col,'--stretch',.04)
    run('particle-2d','--config',cfg,'render','--frame',12,'--out',TMP/(name+'.png'))
cues=[('paddle-bounce',620,110,920),('field-bounce',370,160,220),('target-hit',1050,130,480),('target-break',180,430,65),('shield-reflect',440,320,1300),('pod-catch',660,300,1320),('pod-catch-narrow',330,400,120),('pod-burn',220,380,70),('ball-lost',190,650,55),('wave-clear',520,850,1040),('game-over',95,1800,28),('menu-move',1200,55,900),('menu-select',880,100,1320)]
for i,(name,freq,dur,end) in enumerate(cues):
    cfg=TMP/(name+'.json'); cfg.write_text(json.dumps(dict(sample_rate=44100,channels='stereo',max_duration_ms=dur+400,seed=i+40,actions=str(TMP/(name+'-ops.json')),preview=str(TMP/(name+'.png')),wav=str(ROOT/'assets/audio'/f'{name}.wav'))))
    run('sfx-synth','--config',cfg,'init')
    for voice,fr,gain in [('body',freq,-13),('glass',freq*2.71,-24)]:
        run('sfx-synth','--config',cfg,'add-voice','--name',voice,'--wave','sine','--freq',fr,'--gain',gain,'--dur',dur)
        run('sfx-synth','--config',cfg,'set-envelope','--voice',voice,'--env','pluck')
        run('sfx-synth','--config',cfg,'set-pitch','--voice',voice,'--slide-to',end if voice=='body' else end*2.71,'--over',dur)
    if name in ['target-break','pod-burn','ball-lost','game-over']:
        run('sfx-synth','--config',cfg,'add-voice','--name','debris','--wave','noise','--gain',-24,'--dur',dur*.65)
        run('sfx-synth','--config',cfg,'set-envelope','--voice','debris','--env','pluck')
    run('sfx-synth','--config',cfg,'render')
for bed in ['title','play']:
    name='music-'+bed; cfg=TMP/(name+'.json')
    cfg.write_text(json.dumps(dict(sample_rate=44100,channels='stereo',max_duration_ms=34000,seed=21,actions=str(TMP/(name+'-ops.json')),preview=str(TMP/(name+'.png')),wav=str(TMP/(name+'.wav')),mid=str(TMP/(name+'.mid')))))
    run('music','--config',cfg,'init'); run('music','--config',cfg,'set-tempo','--bpm',120)
    for track,inst in [('pad','sine'),('pulse','triangle'),('sub','sine')]:
        run('music','--config',cfg,'define-track','--name',track,'--instrument',inst)
    chords=[[50,57,60,64],[46,53,57,60],[48,55,58,62],[45,52,55,59]]
    for bar in range(16):
        chord=chords[(bar//2)%4]
        for n in chord: run('music','--config',cfg,'add-note','--track','pad','--pitch',n,'--t',bar*4,'--dur',4.3,'--velocity',36)
        run('music','--config',cfg,'add-note','--track','sub','--pitch',chord[0]-12,'--t',bar*4,'--dur',3.8,'--velocity',45)
        for step in range(8 if bed=='play' else 4):
            run('music','--config',cfg,'add-note','--track','pulse','--pitch',chord[step%4]+12,'--t',bar*4+step*(.5 if bed=='play' else 1),'--dur',.35,'--velocity',42 if step%2==0 else 30)
    run('music','--config',cfg,'render')
    # Fold the rendered tail into a complete 16-second phrase for a periodic seam.
    with wave.open(str(TMP/(name+'.wav')),'rb') as w: params=w.getparams(); data=array.array('h',w.readframes(w.getnframes()))
    length=44100*16*2; out=[0.0]*length
    for i,v in enumerate(data): out[i%length]+=v*.24
    arr=array.array('h',(int(max(-32767,min(32767,v))) for v in out))
    with wave.open(str(ROOT/'assets/audio'/f'{name}.wav'),'wb') as w: w.setparams(params); w.writeframes(arr.tobytes())
print('Produced all sprites, particle systems, cues and music.')
