import React, { useState, useEffect, useMemo, useRef } from 'react';
import htm from 'htm';
import { icons as lucideIcons } from 'lucide';
import { useCloudSync, cloudFiles } from './cloudSync.js';

/* ---------- htm -> React (class/for) ---------- */
const html=htm.bind(function(type,props){
  const kids=Array.prototype.slice.call(arguments,2);
  let p=props;
  if(p){
    p=Object.assign({},p);
    if('class' in p){p.className=p.class;delete p.class;}
    if('for' in p){p.htmlFor=p.for;delete p.for;}
  }
  return React.createElement.apply(null,[type,p].concat(kids));
});

/* ---------- constantes métier ---------- */
const MODES=['Espèces','MTN MoMo','Airtel Money','Virement'];
const MODE_META={
  'Espèces':{icon:'Banknote',color:'#17795A'},
  'MTN MoMo':{icon:'Smartphone',color:'#C9A227'},
  'Airtel Money':{icon:'Smartphone',color:'#B4233F'},
  'Virement':{icon:'Landmark',color:'#14213D'}
};
const CAT_PREST='Prestation Événementielle';
const CAT_VENTE="Vente d'Articles";
const CAT_PRESTA='Paiement Prestataire';
const CATS=[CAT_PREST,CAT_VENTE,'Achat Stock/Fournitures','Frais Généraux',CAT_PRESTA];
const STATUTS=['Lead WhatsApp','Frais initiaux payés','Devis validé','Contrat signé','En cours','Clôturé'];
const CONTRATS=['Brouillon','Envoyé','Signé'];
const VILLES=['Pointe-Noire','Brazzaville','Dolisie','Nkayi','Oyo','Owando','Ouesso','Autre'];
const TYPES_EVT=['Mariage coutumier','Mariage civil','Réception de mariage','Mariage coutumier + civil + réception','Événement corporate','Excursion','Logistique événementielle','Anniversaire / Autre'];
const FRAIS={reperage:10000,prestataires:50000};
const ACTIFS=['Devis validé','Contrat signé','En cours'];
const KEY='axelog-events-v1';
const POLES=['Décoration','Traiteur','Sono/Logistique','Protocole/Sécurité','Transport'];
const POLE_ICON={'Décoration':'Flower2','Traiteur':'UtensilsCrossed','Sono/Logistique':'Speaker','Protocole/Sécurité':'ShieldCheck','Transport':'Bus'};
const PCATS=['Salles/Espaces','Traiteurs','Décorateurs','Transport/Véhicules','Sonorisation','Autres'];
const PCAT_ICON={'Salles/Espaces':'Building2','Traiteurs':'UtensilsCrossed','Décorateurs':'Flower2','Transport/Véhicules':'Car','Sonorisation':'Speaker','Autres':'Package'};
const DOC_STATUTS=['Brouillon','Envoyé','Accepté','Annulé'];
const RATE_DEF={eur:655.957,usd:565};
const CURS=[{id:'XAF',label:'FCFA'},{id:'EUR',label:'EUR (€)'},{id:'USD',label:'USD ($)'}];

const TABS=[
  {id:'dash',label:'Tableau de bord',short:'Accueil',icon:'LayoutDashboard'},
  {id:'crm',label:'Clients & Prospects',short:'Clients',icon:'Users'},
  {id:'caisse',label:'Caisse & Ventes',short:'Caisse',icon:'Wallet'},
  {id:'projets',label:'Projets & Checklists',short:'Projets',icon:'ClipboardCheck'},
  {id:'presta',label:'Prestataires',short:'Presta.',icon:'Truck'},
  {id:'devis',label:'Devis & Facturation',short:'Devis',icon:'Receipt'}
];

/* ---------- helpers ---------- */
const nf=new Intl.NumberFormat('fr-FR');
const nf2=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fcfa=n=>nf.format(Math.round(n||0))+' FCFA';
const numf=n=>nf.format(Math.round(n||0));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const todayISO=()=>iso(new Date());
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d);};
const parseD=s=>new Date(s+'T00:00:00');
const shiftDate=(s,n)=>{if(!s)return '';const d=parseD(s);d.setDate(d.getDate()+n);return iso(d);};
const fdate=s=>s?parseD(s).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'—';
const fdateCsv=s=>s.split('-').reverse().join('/');
const daysUntil=s=>Math.round((parseD(s)-parseD(todayISO()))/86400000);
const uid=()=>Math.random().toString(36).slice(2,10);
const mkRef=(date,n)=>'CAI-'+date.slice(0,4)+'-'+String(n).padStart(4,'0');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pnum=v=>{const n=parseFloat(String(v==null?'':v).replace(/\s/g,'').replace(',','.'));return isFinite(n)?n:0;};

function waLink(tel,nom,msg){
  let d=(tel||'').replace(/\D/g,'');
  if(d.indexOf('00')===0)d=d.slice(2);
  if(d.indexOf('242')!==0)d='242'+d;
  const m=msg||("Bonjour "+nom+", ici Axelog Consulting Event's. ");
  return 'https://wa.me/'+d+'?text='+encodeURIComponent(m);
}

/* ---------- devises (base FCFA / XAF) ---------- */
function ratesOf(s){return {eur:pnum(s&&s.eur)>0?pnum(s.eur):RATE_DEF.eur,usd:pnum(s&&s.usd)>0?pnum(s.usd):RATE_DEF.usd};}
function fmtCur(v,cur,rates){
  v=v||0;
  if(cur==='XAF')return nf.format(Math.round(v))+' FCFA';
  if(cur==='EUR')return nf2.format(v/rates.eur)+' €';
  return nf2.format(v/rates.usd)+' $';
}
function mkCx(settings){
  const rates=ratesOf(settings);
  const cur=(settings&&settings.display)||'XAF';
  return {
    cur:cur,rates:rates,
    fm:n=>fmtCur(n,cur,rates),
    fx:(n,c)=>fmtCur(n,c,rates),
    num:n=>cur==='XAF'?numf(n):nf2.format((n||0)/(cur==='EUR'?rates.eur:rates.usd)),
    unit:cur==='XAF'?'FCFA':cur==='EUR'?'€':'$',
    others:['XAF','EUR','USD'].filter(c=>c!==cur)
  };
}

/* ---------- devis, échéancier, checklist type ---------- */
const defFrais=()=>[
  {id:uid(),libelle:"Repérage d'espaces",montant:String(FRAIS.reperage),on:true},
  {id:uid(),libelle:'Recherche de prestataires',montant:String(FRAIS.prestataires),on:true}
];
const mkLine=(libelle,qte,pu)=>({id:uid(),libelle:libelle,detail:'',unite:'',qte:String(qte),pu:String(pu)});
function devisTotals(d){
  const frais=(d.frais||[]).filter(f=>f.on).reduce((s,f)=>s+pnum(f.montant),0);
  const prest=(d.lignes||[]).reduce((s,l)=>s+pnum(l.qte)*pnum(l.pu),0);
  const marge=Math.round(prest*pnum(d.margePct)/100);
  const total=frais+prest+marge;
  const planned=(d.echeances||[]).reduce((s,e)=>s+pnum(e.montant),0);
  return {frais:frais,prest:prest,marge:marge,total:total,planned:planned,reste:total-planned};
}
function genEcheancier(d,evtDate,p1,p2){
  const t=devisTotals(d);
  const rest=Math.max(0,t.total-t.frais);
  const r1000=x=>Math.round(x/1000)*1000;
  const a1=r1000(rest*p1/100),a2=r1000(rest*p2/100),solde=Math.max(0,rest-a1-a2);
  const base=d.date||todayISO();
  const out=[];
  if(t.frais>0)out.push({id:uid(),libelle:'Frais initiaux non remboursables (avant démarrage)',montant:String(t.frais),date:base,paye:false});
  out.push({id:uid(),libelle:'Acompte 1 à la signature du contrat',montant:String(a1),date:shiftDate(base,7),paye:false});
  out.push({id:uid(),libelle:'Acompte 2',montant:String(a2),date:evtDate?shiftDate(evtDate,-45):'',paye:false});
  out.push({id:uid(),libelle:"Solde avant l'événement",montant:String(solde),date:evtDate?shiftDate(evtDate,-7):'',paye:false});
  return out;
}
function nextNumero(devis,type){
  const y=new Date().getFullYear();
  const pre=type==='Facture'?'FAC':'DEV';
  const n=devis.filter(x=>x.type===type).length+1;
  return pre+'-'+y+'-'+String(n).padStart(3,'0');
}
function newDevis(devis,client,type,fr){
  const d={id:uid(),type:type||'Devis',numero:nextNumero(devis,type||'Devis'),clientId:client?client.id:'',date:todayISO(),validite:shiftDate(todayISO(),30),objet:client?(client.typeEvt||''):'',statut:'Brouillon',margePct:'15',frais:Array.isArray(fr)?fr.map(f=>({id:uid(),libelle:f.libelle,montant:String(f.montant),on:true})):defFrais(),lignes:[],echeances:[],notes:''};
  return d;
}
const TPL=[
  ['Décoration','Valider le thème et la palette de couleurs',-60],['Décoration','Commander tissus, fleurs et accessoires',-30],['Décoration',"Installer la salle, l'arche et les tables",-1],
  ['Traiteur','Définir le menu et le nombre de couverts',-50],['Traiteur','Dégustation et validation du menu',-35],['Traiteur',"Confirmer le nombre final d'invités",-7],
  ['Sono/Logistique','Réserver sono, éclairage et groupe électrogène',-45],['Sono/Logistique','Repérage technique et plan de salle',-14],['Sono/Logistique','Test son et éclairage sur site',-1],
  ['Protocole/Sécurité','Établir le programme et le déroulé',-30],['Protocole/Sécurité','Briefer le maître de cérémonie et le protocole',-7],['Protocole/Sécurité','Prévoir accueil, agents de sécurité et parking',-3],
  ['Transport','Réserver les véhicules du cortège et les navettes',-30],['Transport','Planifier horaires et itinéraires',-10],['Transport','Confirmer chauffeurs et carburant',-2]
];
function tplTasks(client,resps){
  return TPL.map(t=>({id:uid(),clientId:client.id,pole:t[0],titre:t[1],resp:(resps&&resps[t[0]])||'',date:client.date?shiftDate(client.date,t[2]):'',done:false}));
}
const DEMO_RESP={'Décoration':'Coordinatrice déco','Traiteur':'Jessica','Sono/Logistique':'Régisseur technique','Protocole/Sécurité':'Chef de protocole','Transport':'Responsable logistique'};

/* ---------- données de démonstration ---------- */
function defSettings(){return {display:'XAF',eur:RATE_DEF.eur,usd:RATE_DEF.usd,fraisDefaut:[{id:'fd1',libelle:"Repérage d'espaces",montant:String(FRAIS.reperage)},{id:'fd2',libelle:'Recherche de prestataires',montant:String(FRAIS.prestataires)}]};}
function emptyData(settings){return {v:2,clients:[],transactions:[],articles:[],prestataires:[],tasks:[],devis:[],assign:[],seq:0,settings:settings||defSettings()};}
function demo(){
  const clients=[
    {id:'c1',nom:'MBEMBA Christelle Armelle',tel:'06 612 34 56',ville:'Pointe-Noire',typeEvt:'Mariage coutumier',date:addDays(38),budget:3500000,statut:'Contrat signé',contrat:'Signé',notes:'Dot à Tié-Tié, environ 150 invités.'},
    {id:'c2',nom:'NGOMA Rodrigue & MOUKOURI Prisca',tel:'05 534 21 87',ville:'Brazzaville',typeEvt:'Mariage coutumier + civil + réception',date:addDays(17),budget:8500000,statut:'En cours',contrat:'Signé',notes:'Réception à Bacongo, 300 invités. Traiteur choisi.'},
    {id:'c3',nom:'Groupe KONGO BTP SARL',tel:'06 801 45 90',ville:'Pointe-Noire',typeEvt:'Événement corporate',date:addDays(52),budget:6200000,statut:'Devis validé',contrat:'Envoyé',notes:'Séminaire annuel, 80 cadres. Contrat en attente de signature du DG.'},
    {id:'c4',nom:'MAKOSSO Jean-Fidèle',tel:'05 744 12 03',ville:'Dolisie',typeEvt:'Mariage coutumier',date:addDays(95),budget:2800000,statut:'Frais initiaux payés',contrat:'Brouillon',notes:'Repérage de salle à faire à Dolisie.'},
    {id:'c5',nom:'BIYELA Sandra',tel:'06 455 67 12',ville:'Pointe-Noire',typeEvt:'Excursion',date:addDays(60),budget:1450000,statut:'Lead WhatsApp',contrat:'Brouillon',notes:'Sortie de groupe à Pointe-Indienne, 40 personnes.'},
    {id:'c6',nom:'Association des Femmes Entrepreneures du Kouilou (AFEK)',tel:'06 390 22 48',ville:'Pointe-Noire',typeEvt:'Événement corporate',date:addDays(-21),budget:4000000,statut:'Clôturé',contrat:'Signé',notes:'Gala annuel. Dossier soldé.'},
    {id:'c7',nom:'LOUBAKI Dieudonné',tel:'05 618 90 34',ville:'Brazzaville',typeEvt:'Anniversaire / Autre',date:addDays(30),budget:1900000,statut:'Lead WhatsApp',contrat:'Brouillon',notes:'Anniversaire des 50 ans, salle à trouver.'}
  ];
  const T=(o,libelle,categorie,mode,entree,sortie,extra)=>Object.assign({date:addDays(o),libelle:libelle,categorie:categorie,mode:mode,entree:entree||0,sortie:sortie||0},extra||{});
  const raw=[
    T(-70,'Frais initiaux (repérage + prestataires) — Gala AFEK',CAT_PREST,'Espèces',60000,0,{clientId:'c6'}),
    T(-62,'Acompte 1 — Gala AFEK',CAT_PREST,'Virement',1500000,0,{clientId:'c6'}),
    T(-48,'Acompte 2 — Gala AFEK',CAT_PREST,'Virement',1500000,0,{clientId:'c6'}),
    T(-45,'Loyer bureau Pointe-Noire','Frais Généraux','Virement',0,250000),
    T(-40,'Traiteur — Gala AFEK',CAT_PRESTA,'Virement',0,1200000,{clientId:'c6',prestaId:'p5'}),
    T(-30,'Frais initiaux — NGOMA / MOUKOURI',CAT_PREST,'MTN MoMo',60000,0,{clientId:'c2'}),
    T(-28,'Vente : Pagne wax 6 yards × 3',CAT_VENTE,'Espèces',82500,0,{vente:{articleId:'a1',qte:3}}),
    T(-25,'Acompte 1 — NGOMA / MOUKOURI',CAT_PREST,'Virement',3000000,0,{clientId:'c2'}),
    T(-22,'Location salle — Gala AFEK',CAT_PRESTA,'Espèces',0,600000,{clientId:'c6',prestaId:'p2'}),
    T(-21,'Solde final — Gala AFEK',CAT_PREST,'Virement',940000,0,{clientId:'c6'}),
    T(-20,'Achat gobelets personnalisés (10 lots)','Achat Stock/Fournitures','MTN MoMo',0,65000),
    T(-18,'Frais initiaux — MBEMBA',CAT_PREST,'MTN MoMo',60000,0,{clientId:'c1'}),
    T(-15,'Frais initiaux — Groupe KONGO BTP',CAT_PREST,'Virement',60000,0,{clientId:'c3'}),
    T(-14,'Vente : Gobelets personnalisés (lot de 50) × 2',CAT_VENTE,'MTN MoMo',24000,0,{vente:{articleId:'a4',qte:2}}),
    T(-12,'Acompte 1 — MBEMBA',CAT_PREST,'Airtel Money',1200000,0,{clientId:'c1'}),
    T(-10,'Acompte 2 — NGOMA / MOUKOURI',CAT_PREST,'Airtel Money',2000000,0,{clientId:'c2'}),
    T(-9,'Forfait internet & data','Frais Généraux','Airtel Money',0,35000),
    T(-8,'Acompte 1 — Groupe KONGO BTP',CAT_PREST,'Virement',1800000,0,{clientId:'c3'}),
    T(-7,'Acompte salle Panorama — NGOMA / MOUKOURI',CAT_PRESTA,'Virement',0,300000,{clientId:'c2',prestaId:'p3'}),
    T(-6,'Acompte traiteur — mariage NGOMA / MOUKOURI',CAT_PRESTA,'MTN MoMo',0,800000,{clientId:'c2',prestaId:'p4'}),
    T(-5,'Vente : Faire-part personnalisé (lot de 50) × 1',CAT_VENTE,'Espèces',40000,0,{vente:{articleId:'a2',qte:1}}),
    T(-4,'Frais initiaux — MAKOSSO',CAT_PREST,'Espèces',60000,0,{clientId:'c4'}),
    T(-3,'Transport & carburant','Frais Généraux','Espèces',0,25000),
    T(-3,'Acompte décoration — MBEMBA',CAT_PRESTA,'MTN MoMo',0,250000,{clientId:'c1',prestaId:'p6'}),
    T(-2,'Vente : Éventail de cérémonie × 20',CAT_VENTE,'MTN MoMo',50000,0,{vente:{articleId:'a6',qte:20}})
  ];
  raw.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  raw.forEach((t,i)=>{t.id=uid();t.ref=mkRef(t.date,i+1);});
  const articles=[
    {id:'a1',nom:'Pagne wax 6 yards',achat:18000,vente:27500,stock:15,seuil:5},
    {id:'a2',nom:'Faire-part personnalisé (lot de 50)',achat:25000,vente:40000,stock:6,seuil:3},
    {id:'a3',nom:'Coffret cadeau mariage',achat:15000,vente:28000,stock:4,seuil:5},
    {id:'a4',nom:'Gobelets personnalisés (lot de 50)',achat:6500,vente:12000,stock:30,seuil:10},
    {id:'a5',nom:'Boîte à dragées dorée (lot de 20)',achat:9000,vente:16500,stock:2,seuil:4},
    {id:'a6',nom:'Éventail de cérémonie',achat:1200,vente:2500,stock:80,seuil:20}
  ];
  const P=(id,nom,cat,ville,tel,tarif,note,notes)=>({id:id,nom:nom,cat:cat,ville:ville,tel:tel,tarif:tarif,note:note,notes:notes||''});
  const prestataires=[
    P('p1','Salle des Fêtes Le Palmier','Salles/Espaces','Pointe-Noire','06 511 20 30',450000,4,'Capacité 200 personnes, climatisée.'),
    P('p2','Espace Océan Events (Tié-Tié)','Salles/Espaces','Pointe-Noire','05 560 78 12',600000,4,'Salle + terrasse, groupe électrogène inclus.'),
    P('p3','Salle Panorama Bacongo','Salles/Espaces','Brazzaville','06 640 33 21',700000,5,'Jusqu’à 350 personnes.'),
    P('p4','Traiteur Saveurs du Congo','Traiteurs','Brazzaville','06 622 41 09',1500000,5,'Cuisine congolaise et buffet international.'),
    P('p5','Mama Nzila Traiteur','Traiteurs','Pointe-Noire','05 548 17 66',1100000,4,'Spécialiste poisson braisé et saka-saka.'),
    P('p6','Déco Prestige Congo','Décorateurs','Pointe-Noire','06 677 25 14',650000,4,'Arches, tentures, centres de table.'),
    P('p7','Fleurs & Tentures Mpila','Décorateurs','Brazzaville','05 591 08 43',500000,3,''),
    P('p8','Location Cars Mayombe','Transport/Véhicules','Pointe-Noire','06 433 90 12',250000,4,'Minibus 18 places et 4x4 pour cortège.'),
    P('p9','Sono Pro 242','Sonorisation','Brazzaville','05 502 64 87',350000,5,'Sono, lumières et DJ.'),
    P('p10','Sécurité & Protocole Bantou','Autres','Pointe-Noire','06 489 12 70',200000,4,'Agents de sécurité et hôtesses d’accueil.')
  ];
  const A=(clientId,prestaId,prestation,convenu)=>({id:uid(),clientId:clientId,prestaId:prestaId,prestation:prestation,convenu:convenu});
  const assign=[
    A('c6','p5','Menu gala, 200 couverts',1200000),A('c6','p2','Location salle',600000),
    A('c2','p4','Traiteur 300 invités',2400000),A('c2','p3','Salle Panorama',700000),A('c2','p9','Sonorisation et éclairage',350000),
    A('c1','p6','Décoration cérémonie',650000),A('c1','p8','Véhicules cortège',250000),
    A('c3','p2','Salle de séminaire',600000)
  ];
  const tasks=[];
  ['c1','c2','c3'].forEach(id=>{
    const c=clients.find(x=>x.id===id);
    tplTasks(c,DEMO_RESP).forEach(t=>{t.done=!!t.date&&t.date<todayISO();tasks.push(t);});
  });
  const mk=(o)=>Object.assign({id:uid(),type:'Devis',statut:'Brouillon',margePct:'15',frais:defFrais(),lignes:[],echeances:[],notes:'',objet:'',validite:'',date:todayISO()},o);
  const d1=mk({numero:'DEV-2026-001',clientId:'c1',date:addDays(-25),validite:addDays(5),statut:'Accepté',margePct:'20',objet:'Mariage coutumier — Tié-Tié, 150 invités',
    lignes:[mkLine('Coordination et protocole le jour J',1,350000),mkLine('Décoration complète (arche, tables, fleurs)',1,650000),mkLine('Traiteur, 150 invités',150,7000),mkLine('Sonorisation et éclairage',1,350000),mkLine('Véhicules du cortège',1,250000)]});
  d1.echeances=genEcheancier(d1,clients[0].date,40,30);d1.echeances[0].paye=true;d1.echeances[1].paye=true;
  const d2=mk({numero:'DEV-2026-002',clientId:'c2',date:addDays(-32),validite:addDays(-2),statut:'Accepté',margePct:'20',objet:'Mariage coutumier, civil et réception — Bacongo, 300 invités',
    lignes:[mkLine('Location Salle Panorama',1,700000),mkLine('Traiteur, 300 invités',300,8000),mkLine('Décoration complète',1,1200000),mkLine('Sonorisation, lumières et DJ',1,350000),mkLine('Véhicules et cortège',1,400000),mkLine('Coordination, protocole et sécurité',1,600000),mkLine('Photo et vidéo',1,800000)]});
  d2.echeances=genEcheancier(d2,clients[1].date,40,30);d2.echeances[0].paye=true;d2.echeances[1].paye=true;d2.echeances[2].paye=true;
  const d3=mk({numero:'DEV-2026-003',clientId:'c3',date:addDays(-12),validite:addDays(18),statut:'Envoyé',margePct:'25',objet:'Séminaire annuel — 80 cadres',
    lignes:[mkLine('Salle de séminaire (2 jours)',1,600000),mkLine('Déjeuners',80,9000),mkLine('Pauses café',80,3500),mkLine('Sonorisation et vidéoprojection',1,450000),mkLine('Badges et supports imprimés',80,2500),mkLine('Navettes hôtel / salle',1,350000)]});
  d3.echeances=genEcheancier(d3,clients[2].date,40,30);d3.echeances[0].paye=true;
  return {v:2,clients:clients,transactions:raw,articles:articles,prestataires:prestataires,tasks:tasks,devis:[d1,d2,d3],assign:assign,seq:raw.length,settings:defSettings()};
}
function migrate(d){
  const out=Object.assign({seq:d.transactions.length},d);
  out.v=2;
  out.settings=Object.assign(defSettings(),d.settings||{});
  const need=['prestataires','tasks','devis','assign'].filter(k=>!Array.isArray(d[k]));
  if(need.length){
    const base=demo();const ids={};d.clients.forEach(c=>{ids[c.id]=1;});
    need.forEach(k=>{out[k]=k==='prestataires'?base[k]:base[k].filter(x=>!x.clientId||ids[x.clientId]);});
    if(need.indexOf('assign')>=0){const pids={};out.prestataires.forEach(p=>{pids[p.id]=1;});out.assign=out.assign.filter(a=>pids[a.prestaId]);}
  }
  return out;
}
function load(){
  try{
    const r=localStorage.getItem(KEY);
    if(r){const d=JSON.parse(r);if(d&&Array.isArray(d.clients)&&Array.isArray(d.transactions)&&Array.isArray(d.articles))return migrate(d);}
  }catch(e){}
  return demo();
}
function persist(d){try{localStorage.setItem(KEY,JSON.stringify(d));}catch(e){}}

/* ---------- calculs ---------- */
function ledger(transactions){
  const rows=transactions.map((t,i)=>({t:t,i:i})).sort((a,b)=>a.t.date===b.t.date?a.i-b.i:(a.t.date<b.t.date?-1:1));
  let s=0;
  return rows.map(r=>{s+=r.t.entree-r.t.sortie;return Object.assign({},r.t,{solde:s});});
}
function computeStats(d){
  let ent=0,sor=0,ca=0,ventes=0;
  const byMode={};MODES.forEach(m=>{byMode[m]={e:0,s:0};});
  const enc={},dec={},paidP={};
  d.transactions.forEach(t=>{
    ent+=t.entree;sor+=t.sortie;
    if(t.categorie===CAT_PREST)ca+=t.entree;
    if(t.categorie===CAT_VENTE)ventes+=t.entree;
    if(byMode[t.mode]){byMode[t.mode].e+=t.entree;byMode[t.mode].s+=t.sortie;}
    if(t.clientId){
      if(t.categorie===CAT_PREST)enc[t.clientId]=(enc[t.clientId]||0)+t.entree;
      dec[t.clientId]=(dec[t.clientId]||0)+t.sortie;
      if(t.prestaId)paidP[t.prestaId+'|'+t.clientId]=(paidP[t.prestaId+'|'+t.clientId]||0)+t.sortie;
    }
  });
  const paid=enc;
  const resteOf=c=>Math.max(0,(Number(c.budget)||0)-(enc[c.id]||0));
  const margeOf=id=>(enc[id]||0)-(dec[id]||0);
  const cl={};d.clients.forEach(c=>{cl[c.id]=c;});
  const pr={};d.prestataires.forEach(p=>{pr[p.id]=p;});
  const actifs=d.clients.filter(c=>ACTIFS.indexOf(c.statut)>=0);
  const reste=actifs.reduce((s,c)=>s+resteOf(c),0);
  const margeTotal=d.clients.reduce((s,c)=>s+margeOf(c.id),0);
  const today=todayISO();
  const upcoming=d.clients.filter(c=>c.date&&c.date>=today&&c.statut!=='Lead WhatsApp'&&c.statut!=='Clôturé').sort((a,b)=>a.date<b.date?-1:1);
  const progress={};
  d.clients.forEach(c=>{progress[c.id]={total:0,done:0,pct:0,late:0};});
  d.tasks.forEach(t=>{const p=progress[t.clientId];if(!p)return;p.total++;if(t.done)p.done++;else if(t.date&&t.date<today)p.late++;});
  Object.keys(progress).forEach(k=>{const p=progress[k];p.pct=p.total?Math.round(p.done/p.total*100):0;});
  const assignRows=d.assign.filter(a=>cl[a.clientId]&&pr[a.prestaId]).map(a=>{
    const paye=paidP[a.prestaId+'|'+a.clientId]||0;
    return Object.assign({},a,{paye:paye,reste:Math.max(0,(Number(a.convenu)||0)-paye)});
  });
  const duePresta=assignRows.reduce((s,a)=>s+a.reste,0);
  const devisOpen=d.devis.filter(x=>x.statut==='Envoyé');
  const devisOpenTotal=devisOpen.reduce((s,x)=>s+devisTotals(x).total,0);
  const alerts=[];
  actifs.filter(c=>c.contrat!=='Signé').forEach(c=>alerts.push({sev:'crit',icon:'FileSignature',title:'Contrat non signé — '+c.nom,detail:'Statut « '+c.statut+' », contrat '+c.contrat.toLowerCase(),tab:'crm'}));
  actifs.forEach(c=>{
    const r=resteOf(c);
    if(r>0&&c.date){
      const j=daysUntil(c.date);
      if(j<=30)alerts.push({sev:j<=14?'crit':'warn',icon:'Clock',title:'Solde à encaisser — '+c.nom,detail:r,detailKind:'amt',detailSuffix:' restants, '+(j<0?'événement passé':j===0?'événement aujourd’hui':'événement dans '+j+' j'),tab:'crm',edit:c.id});
    }
  });
  assignRows.filter(a=>a.reste>0&&cl[a.clientId].date&&cl[a.clientId].statut!=='Clôturé'&&daysUntil(cl[a.clientId].date)<=30).forEach(a=>alerts.push({sev:'warn',icon:'Truck',title:'Prestataire à régler — '+pr[a.prestaId].nom,detail:a.reste,detailKind:'amt',detailSuffix:' dus pour '+cl[a.clientId].nom,tab:'presta',sub:'suivi'}));
  devisOpen.forEach(x=>alerts.push({sev:'warn',icon:'Receipt',title:'Devis sans réponse — '+x.numero,detail:(cl[x.clientId]?cl[x.clientId].nom:'Client à choisir')+' · envoyé, en attente d’acceptation',tab:'devis',devisId:x.id}));
  d.clients.filter(c=>c.statut!=='Clôturé'&&progress[c.id].late>0).forEach(c=>alerts.push({sev:'warn',icon:'ListChecks',title:progress[c.id].late+' tâche'+(progress[c.id].late>1?'s':'')+' en retard — '+c.nom,detail:'Checklist terrain à mettre à jour',tab:'projets',sel:c.id}));
  d.articles.filter(a=>a.stock<=a.seuil).forEach(a=>alerts.push({sev:a.stock===0?'crit':'warn',icon:'Package',title:'Stock bas — '+a.nom,detail:a.stock+' en stock (seuil d’alerte : '+a.seuil+')',tab:'caisse',sub:'catalogue'}));
  return {ent:ent,sor:sor,solde:ent-sor,ca:ca,ventes:ventes,byMode:byMode,paid:paid,enc:enc,dec:dec,margeOf:margeOf,margeTotal:margeTotal,resteOf:resteOf,reste:reste,nbActifs:actifs.length,upcoming:upcoming,alerts:alerts,progress:progress,assignRows:assignRows,duePresta:duePresta,paidP:paidP,devisOpen:devisOpen,devisOpenTotal:devisOpenTotal,cl:cl,pr:pr};
}
function csvEsc(v){const s=String(v==null?'':v);return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function buildCsv(rows,rates){
  const e=v=>(v/rates.eur).toFixed(2).replace('.',',');
  const u=v=>(v/rates.usd).toFixed(2).replace('.',',');
  const head=['Date','Référence','Libellé','Catégorie','Mode de paiement','Entrée (+ FCFA)','Sortie (- FCFA)','Solde (FCFA)','Solde (EUR)','Solde (USD)'];
  const lines=[head.map(csvEsc).join(';')];
  rows.forEach(r=>lines.push([fdateCsv(r.date),r.ref,r.libelle,r.categorie,r.mode,r.entree||'',r.sortie||'',r.solde,e(r.solde),u(r.solde)].map(csvEsc).join(';')));
  return '﻿'+lines.join('\r\n');
}

/* ---------- devises : contexte, montants, réglages ---------- */
const Cx=React.createContext(mkCx(null));
function useCx(){return React.useContext(Cx);}
function Amt(props){
  const cx=useCx();
  const v=props.v||0;
  const eq=props.eq!==false;
  return html`<span class=${'amt '+(props.className||'')} style=${props.style}>
    <span class="amt-main num">${props.sign&&v>0?'+ ':''}${cx.fm(v)}</span>
    ${eq&&html`<span class="amt-eq num">≈ ${cx.others.map(c=>cx.fx(v,c)).join(' · ')}</span>`}
  </span>`;
}
function Eq(props){
  const cx=useCx();
  return html`<span class="num muted" style=${props.style}>≈ ${cx.others.map(c=>cx.fx(props.v||0,c)).join(' · ')}</span>`;
}
function CurBar(props){
  const cx=useCx();
  return html`<div class="curbar">
    <div class="curseg" role="group" aria-label="Devise d'affichage">
      ${CURS.map(c=>html`<button key=${c.id} type="button" class=${cx.cur===c.id?'on':''} aria-pressed=${cx.cur===c.id} onClick=${()=>props.setCur(c.id)}>${c.label}</button>`)}
    </div>
    <button type="button" class="icon-btn curgear" onClick=${props.onRates} aria-label="Réglages : taux de change et frais fixes" title="Réglages : taux de change et frais fixes"><${Icon} name="ArrowRightLeft" size=${16} /></button>
  </div>`;
}
function Converter(){
  const cx=useCx();
  const [src,setSrc]=useState('XAF');
  const [val,setVal]=useState('100000');
  const n=pnum(val);
  const rate=c=>c==='EUR'?cx.rates.eur:cx.rates.usd;
  const f=src==='XAF'?n:n*rate(src);
  const shown=c=>c===src?val:(c==='XAF'?String(Math.round(f)):String(Math.round(f/rate(c)*100)/100).replace('.',','));
  const lab={XAF:'FCFA',EUR:'Euros (€)',USD:'Dollars ($)'};
  return html`<div class="grid gap-2 sm:grid-cols-3">
    ${['XAF','EUR','USD'].map(c=>html`<div key=${c}>
      <label class="label" for=${'cv-'+c}>${lab[c]}</label>
      <input id=${'cv-'+c} class="input num" inputMode="decimal" value=${shown(c)} onChange=${e=>{setSrc(c);setVal(e.target.value);}} />
    </div>`)}
  </div>`;
}
function RatesModal(props){
  const cx=useCx();
  const s=props.settings;
  const [eur,setEur]=useState(String(s.eur).replace('.',','));
  const [usd,setUsd]=useState(String(s.usd).replace('.',','));
  const eOk=pnum(eur)>0,uOk=pnum(usd)>0;
  const commit=(k,v,setter)=>{setter(v);if(pnum(v)>0)props.onChange({[k]:pnum(v)});};
  const reset=()=>{setEur(String(RATE_DEF.eur).replace('.',','));setUsd(String(RATE_DEF.usd).replace('.',','));props.onChange({eur:RATE_DEF.eur,usd:RATE_DEF.usd});};
  const frais=s.fraisDefaut||[];
  const setFrais=list=>props.onChange({fraisDefaut:list});
  const updF=(id,p)=>setFrais(frais.map(f=>f.id===id?Object.assign({},f,p):f));
  return html`<${Modal} title="Réglages : taux de change et frais fixes" onClose=${props.onClose} wide=${true}>
    <div class="flex flex-col gap-5">
      <section class="flex flex-col gap-3">
        <h3>Taux de change</h3>
        <p class="muted">La saisie et la comptabilité restent en FCFA (XAF). Les équivalents en € et en $ se recalculent aussitôt dans toute l'application et sont enregistrés sur cet appareil.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <${Field} id="rt-eur" label="1 € (EUR) = … FCFA"><input id="rt-eur" class="input num" inputMode="decimal" value=${eur} onChange=${e=>commit('eur',e.target.value,setEur)} aria-invalid=${!eOk} /><//>
          <${Field} id="rt-usd" label="1 $ (USD) = … FCFA"><input id="rt-usd" class="input num" inputMode="decimal" value=${usd} onChange=${e=>commit('usd',e.target.value,setUsd)} aria-invalid=${!uOk} /><//>
        </div>
        ${(!eOk||!uOk)&&html`<p style=${{color:'var(--crit)',fontWeight:700,fontSize:13}}>Entrez un nombre supérieur à 0. Le dernier taux valide reste appliqué.</p>`}
        <div class="card" style=${{padding:'12px 14px',background:'var(--violet-soft)',borderColor:'transparent'}}>
          <p class="num" style=${{fontWeight:700}}>1 € = ${nf2.format(cx.rates.eur/cx.rates.usd)} $</p>
          <p class="muted" style=${{fontSize:12.5}}>Parité implicite déduite des deux taux. Le FCFA (XAF) est arrimé à l'euro à 655,957 ; le taux du dollar varie selon le cours du jour.</p>
        </div>
        <${Converter} />
        <div><button class="btn btn-ghost btn-sm" onClick=${reset}><${Icon} name="RotateCcw" size=${14} /> Taux par défaut</button></div>
      </section>
      <hr class="divider" />
      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3>Frais fixes non remboursables par défaut</h3>
          <button class="btn btn-ghost btn-sm" onClick=${()=>setFrais(frais.concat([{id:uid(),libelle:'Nouveau frais',montant:'0'}]))}><${Icon} name="Plus" size=${14} /> Ajouter un frais</button>
        </div>
        <p class="muted" style=${{fontSize:12.5}}>Ajoutés automatiquement aux nouveaux devis et proposés lors de l'encaissement des frais initiaux. Les documents déjà créés gardent leurs propres frais, modifiables dans chaque devis.</p>
        ${frais.length===0&&html`<p class="muted">Aucun frais par défaut.</p>`}
        ${frais.map(f=>html`<div key=${f.id} class="fdrow">
          <input class="input" value=${f.libelle} onChange=${e=>updF(f.id,{libelle:e.target.value})} aria-label="Libellé du frais" />
          <input class="input num" type="number" min="0" step="1000" inputMode="numeric" value=${f.montant} onChange=${e=>updF(f.id,{montant:e.target.value})} aria-label="Montant en FCFA" />
          <${DelBtn} onDelete=${()=>setFrais(frais.filter(x=>x.id!==f.id))} label="Supprimer ce frais par défaut" />
          <span class="fd-eq"><${Eq} v=${pnum(f.montant)} style=${{fontSize:12}} /></span>
        </div>`)}
      </section>
      <div class="flex justify-end"><button class="btn btn-primary" onClick=${props.onClose}><${Icon} name="Check" size=${16} /> Terminé</button></div>
    </div>
  <//>`;
}
function ConfirmBtn(props){
  const [c,setC]=useState(false);
  if(c)return html`<span class="flex items-center gap-1"><button type="button" class="btn btn-danger btn-sm" onClick=${()=>{setC(false);props.onConfirm();}}>Confirmer</button><button type="button" class="btn btn-ghost btn-sm" onClick=${()=>setC(false)}>Non</button></span>`;
  return html`<button type="button" class="btn btn-ghost btn-sm" disabled=${props.disabled} onClick=${()=>setC(true)}><${Icon} name=${props.icon||'Trash2'} size=${14} /> ${props.label}</button>`;
}
function DelBtn(props){
  const [c,setC]=useState(false);
  if(c)return html`<span class="flex items-center gap-1" style=${{whiteSpace:'nowrap'}}>
    <button type="button" class="btn btn-danger btn-sm" onClick=${()=>{setC(false);props.onDelete();}}>Supprimer</button>
    <button type="button" class="btn btn-ghost btn-sm" onClick=${()=>setC(false)}>Non</button></span>`;
  return html`<button type="button" class="icon-btn del" onClick=${()=>setC(true)} aria-label=${props.label||'Supprimer'}><${Icon} name="Trash2" size=${props.size||15} /></button>`;
}
function Stars(props){
  return html`<span class="flex items-center" role="group" aria-label=${'Fiabilité : '+props.value+' sur 5'}>
    ${[1,2,3,4,5].map(i=>html`<button key=${i} type="button" class=${'star'+(i<=props.value?' on':'')} onClick=${()=>props.onChange&&props.onChange(i===props.value?i-1:i)} aria-label=${i+' sur 5'} disabled=${!props.onChange} style=${{cursor:props.onChange?'pointer':'default'}}>
      <${Icon} name="Star" size=${props.size||16} fill=${i<=props.value?'currentColor':'none'} /></button>`)}
    <span class="num muted" style=${{fontSize:12,marginLeft:4}}>${props.value}/5</span>
  </span>`;
}
function Progress(props){
  const p=props.pct||0;
  return html`<div class="bar" role="progressbar" aria-valuenow=${p} aria-valuemin="0" aria-valuemax="100" style=${{height:props.h||8}}><span style=${{width:p+'%',background:p>=100?'var(--ok)':'var(--violet)'}}></span></div>`;
}

/* ---------- composants de base ---------- */
function Icon(props){
  const size=props.size||18;
  const lib=lucideIcons;
  const node=lib&&lib[props.name];
  if(!node)return html`<span class="ic" style=${{width:size,height:size,display:'inline-block'}}></span>`;
  const kids=(node.length===3&&node[0]==='svg')?node[2]:node;
  return React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',width:size,height:size,viewBox:'0 0 24 24',fill:props.fill||'none',stroke:'currentColor',strokeWidth:props.sw||2,strokeLinecap:'round',strokeLinejoin:'round',className:'ic '+(props.className||''),'aria-hidden':'true'},
    kids.map((n,i)=>React.createElement(n[0],Object.assign({key:i},n[1]))));
}
function Modal(props){
  const close=props.onClose;
  useEffect(()=>{
    const k=e=>{if(e.key==='Escape')close();};
    document.addEventListener('keydown',k);
    return()=>document.removeEventListener('keydown',k);
  },[]);
  return html`<div class="modal-back" onMouseDown=${e=>{if(e.target===e.currentTarget)close();}}>
    <div class=${'modal'+(props.wide?' wide':'')} role="dialog" aria-modal="true" aria-label=${props.title}>
      <div class="modal-head">
        <h3>${props.title}</h3>
        <button type="button" class="icon-btn" onClick=${close} aria-label="Fermer"><${Icon} name="X" size=${18} /></button>
      </div>
      <div class="modal-body">${props.children}</div>
    </div>
  </div>`;
}
function Field(props){
  return html`<div class=${props.cls||''}><label class="label" for=${props.id}>${props.label}</label>${props.children}</div>`;
}
const STATUT_STYLE={
  'Lead WhatsApp':{bg:'#EDEFF5',fg:'#3A4766'},
  'Frais initiaux payés':{bg:'var(--gold-soft)',fg:'#7A5F0A'},
  'Devis validé':{bg:'var(--violet-soft)',fg:'var(--violet)'},
  'Contrat signé':{bg:'var(--ok-soft)',fg:'var(--ok)'},
  'En cours':{bg:'var(--night)',fg:'#fff'},
  'Clôturé':{bg:'#ECEAF1',fg:'var(--muted)'}
};
const CONTRAT_STYLE={
  'Brouillon':{bg:'#ECEAF1',fg:'var(--muted)'},
  'Envoyé':{bg:'var(--warn-soft)',fg:'var(--warn)'},
  'Signé':{bg:'var(--ok-soft)',fg:'var(--ok)'}
};
function Pill(props){
  const s=props.map[props.value]||{bg:'#ECEAF1',fg:'var(--muted)'};
  return html`<span class="pill" style=${{background:s.bg,color:s.fg}}>${props.value}</span>`;
}
function DayBadge(props){
  if(!props.date)return null;
  const j=daysUntil(props.date);
  const txt=j===0?"Aujourd'hui":j>0?'J-'+j:'Passé';
  const st=j<0?{bg:'#ECEAF1',fg:'var(--muted)'}:j<=14?{bg:'var(--crit-soft)',fg:'var(--crit)'}:j<=30?{bg:'var(--warn-soft)',fg:'var(--warn)'}:{bg:'var(--violet-soft)',fg:'var(--violet)'};
  return html`<span class="pill num" style=${{background:st.bg,color:st.fg}}>${txt}</span>`;
}
function Empty(props){
  return html`<div class="card pad" style=${{textAlign:'center',padding:'36px 18px'}}>
    <div style=${{color:'var(--violet)',display:'flex',justifyContent:'center',marginBottom:8}}><${Icon} name=${props.icon||'Sparkles'} size=${28} /></div>
    <p style=${{fontWeight:700}}>${props.title}</p>
    <p class="muted" style=${{marginTop:2}}>${props.text}</p>
    ${props.children}
  </div>`;
}
function PageHead(props){
  return html`<div class="flex flex-wrap items-end justify-between gap-3" style=${{marginBottom:18}}>
    <div style=${{minWidth:0}}>
      <p class="eyebrow">${props.eyebrow}</p>
      <h1>${props.title}</h1>
      ${props.sub&&html`<p class="muted" style=${{marginTop:4}}>${props.sub}</p>`}
    </div>
    <div class="flex flex-wrap gap-2">${props.children}</div>
  </div>`;
}

/* ---------- Tableau de bord ---------- */
function Kpi(props){
  const onKey=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();props.onOpen();}};
  return html`<div class=${'card pad kcard'+(props.hero?' kpi-hero':'')} role="button" tabIndex="0" onClick=${props.onOpen} onKeyDown=${onKey} aria-label=${props.label}>
    <div class="flex items-start justify-between gap-2"><p class="eyebrow">${props.label}</p>${props.action}</div>
    ${props.children}
  </div>`;
}
function KpiAction(props){
  return html`<button type="button" class=${'btn btn-sm '+(props.gold?'btn-gold':'btn-ghost')} onClick=${e=>{e.stopPropagation();props.onClick();}} onKeyDown=${e=>e.stopPropagation()} style=${{minHeight:28,padding:'3px 9px'}}><${Icon} name=${props.icon} size=${13} /> ${props.children}</button>`;
}
function Dashboard(props){
  const {data,S,go,onResetDemo,onClear}=props;
  const cx=useCx();
  const [confirm,setConfirm]=useState('');
  const tot=(S.ca+S.ventes)||1;
  const pctCA=Math.round(S.ca/tot*100);
  const within30=S.upcoming.filter(c=>daysUntil(c.date)<=30).length;
  const sevStyle={crit:{bg:'var(--crit-soft)',fg:'var(--crit)'},warn:{bg:'var(--warn-soft)',fg:'var(--warn)'}};
  const today=new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const pipe=STATUTS.map(s=>({s:s,n:data.clients.filter(c=>c.statut===s).length}));
  const creances=data.clients.filter(c=>ACTIFS.indexOf(c.statut)>=0&&S.resteOf(c)>0).sort((a,b)=>(a.date||'9')<(b.date||'9')?-1:1);
  const stock=data.articles.slice().sort((a,b)=>(a.stock-a.seuil)-(b.stock-b.seuil)).slice(0,4);
  const margeClass=S.margeTotal<0?'neg':'';
  return html`<div>
    <${PageHead} eyebrow=${today} title="Tableau de bord" sub="Axelog Consulting Event's · Pointe-Noire / Brazzaville · cliquez sur un indicateur pour corriger les données qui l'alimentent" />
    <div class="chips" style=${{marginBottom:12}} role="group" aria-label="Ajout rapide">
      <span class="eyebrow" style=${{alignSelf:'center',marginRight:4,flexShrink:0}}>Ajouter</span>
      ${[['client','UserPlus','Client'],['tx','Wallet','Opération'],['article','ShoppingBag','Article'],['presta','Truck','Prestataire'],['devis','Receipt','Devis'],['tache','ListChecks','Tâche']].map(q=>html`<button key=${q[0]} type="button" class="chip flex items-center gap-1" onClick=${()=>props.onQuick(q[0])}><${Icon} name=${q[1]} size=${14} /> ${q[2]}</button>`)}
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <${Kpi} hero=${true} label="Solde de caisse global" onOpen=${()=>props.openJournal({})} action=${html`<div class="flex gap-1"><${KpiAction} gold=${true} icon="Plus" onClick=${()=>props.onNewTx(null)}>Opération<//><${KpiAction} icon="Pencil" onClick=${()=>props.onAdjust()}>Ajuster<//></div>`}>
        <${Amt} className="font-display" style=${{fontSize:26,fontWeight:700,marginTop:6}} v=${S.solde} />
        <p class="num" style=${{marginTop:8,fontSize:12.5,color:'#C9D0E3'}}>Entrées ${cx.num(S.ent)} · Sorties ${cx.num(S.sor)} ${cx.unit}</p>
      <//>
      <${Kpi} label="CA Événementiel vs Ventes d'articles" onOpen=${()=>props.openJournal({})}>
        <div class="flex items-start justify-between gap-2" style=${{marginTop:8}}>
          <button type="button" onClick=${e=>{e.stopPropagation();props.openJournal({cat:CAT_PREST});}} style=${{background:'transparent',border:0,padding:0,textAlign:'left',cursor:'pointer',font:'inherit',color:'var(--violet)',minWidth:0}} aria-label="Voir les prestations événementielles">
            <${Amt} className="font-display" style=${{fontSize:17,fontWeight:700}} v=${S.ca} /></button>
          <button type="button" onClick=${e=>{e.stopPropagation();props.openJournal({cat:CAT_VENTE});}} style=${{background:'transparent',border:0,padding:0,textAlign:'right',cursor:'pointer',font:'inherit',color:'var(--gold-d)',minWidth:0}} aria-label="Voir les ventes d'articles">
            <${Amt} className="font-display r" style=${{fontSize:17,fontWeight:700}} v=${S.ventes} /></button>
        </div>
        <div class="bar" style=${{marginTop:8}}>
          <span style=${{width:pctCA+'%',background:'var(--violet)'}}></span>
          <span style=${{width:(100-pctCA)+'%',background:'var(--gold)'}}></span>
        </div>
        <div class="flex justify-between" style=${{marginTop:6,fontSize:12,color:'var(--muted)'}}><span>Événementiel ${pctCA}%</span><span>Articles ${100-pctCA}%</span></div>
      <//>
      <${Kpi} label="Reste à encaisser" onOpen=${()=>go('crm')} action=${html`<${KpiAction} icon="Pencil" onClick=${()=>go('crm')}>Clients<//>`}>
        <${Amt} className="font-display" style=${{fontSize:26,fontWeight:700,marginTop:6}} v=${S.reste} />
        <p class="muted" style=${{marginTop:8,fontSize:12.5}}>${S.nbActifs} dossier${S.nbActifs>1?'s':''} actif${S.nbActifs>1?'s':''} (devis validé à en cours)</p>
      <//>
      <${Kpi} label="Événements à venir" onOpen=${()=>go('projets')}>
        <p class="font-display num" style=${{fontSize:26,fontWeight:700,lineHeight:1.15,marginTop:6}}>${S.upcoming.length}</p>
        <p class="muted" style=${{marginTop:8,fontSize:12.5}}>${within30} dans les 30 prochains jours</p>
      <//>
    </div>

    <div class="grid gap-3 sm:grid-cols-3" style=${{marginTop:12}}>
      <${Kpi} label="Marge nette réelle" onOpen=${()=>go('devis')}>
        <${Amt} className=${'font-display '+margeClass} style=${{fontSize:22,fontWeight:700,marginTop:6}} v=${S.margeTotal} />
        <p class="muted" style=${{marginTop:6,fontSize:12.5}}>Encaissements clients moins décaissements prestataires</p>
      <//>
      <${Kpi} label="Dû aux prestataires" onOpen=${()=>props.goAlert({tab:'presta',sub:'suivi'})}>
        <${Amt} className="font-display" style=${{fontSize:22,fontWeight:700,marginTop:6}} v=${S.duePresta} />
        <p class="muted" style=${{marginTop:6,fontSize:12.5}}>Solde restant sur les montants convenus</p>
      <//>
      <${Kpi} label="Devis en attente de réponse" onOpen=${()=>go('devis')}>
        <p class="font-display num" style=${{fontSize:22,fontWeight:700,marginTop:6}}>${S.devisOpen.length}</p>
        <p class="num muted" style=${{marginTop:6,fontSize:12.5}}>${S.devisOpen.length?'Total '+cx.fm(S.devisOpenTotal):'Aucun devis envoyé en attente'}</p>
      <//>
    </div>

    <div class="grid gap-3 lg:grid-cols-3" style=${{marginTop:12}}>
      <section class="card pad lg:col-span-2">
        <div class="flex items-center justify-between gap-2" style=${{marginBottom:14}}>
          <h2>Ventilation par canal</h2>
          <div class="flex flex-wrap gap-2"><button class="btn btn-ghost btn-sm" onClick=${()=>props.onAdjust()}><${Icon} name="Pencil" size=${14} /> Ajuster un solde</button><button class="btn btn-ghost btn-sm" onClick=${()=>props.openJournal({})}>Voir le journal <${Icon} name="ChevronRight" size=${14} /></button></div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          ${MODES.map(m=>{
            const v=S.byMode[m];const solde=v.e-v.s;const share=S.ent?Math.round(v.e/S.ent*100):0;const meta=MODE_META[m];
            return html`<button key=${m} type="button" onClick=${()=>props.openJournal({mode:m})} style=${{textAlign:'left',background:'transparent',border:0,padding:0,font:'inherit',color:'inherit',cursor:'pointer',minWidth:0}} aria-label=${'Voir les opérations '+m}>
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2" style=${{fontWeight:700}}>
                  <span style=${{width:30,height:30,borderRadius:9,background:'var(--violet-soft)',color:meta.color,display:'inline-flex',alignItems:'center',justifyContent:'center'}}><${Icon} name=${meta.icon} size=${16} /></span>${m}
                </div>
                <${Amt} className=${'font-display r '+(solde<0?'neg':'')} style=${{fontWeight:700,fontSize:15}} v=${solde} />
              </div>
              <div class="bar" style=${{marginTop:8}}><span style=${{width:share+'%',background:meta.color}}></span></div>
              <p class="num muted" style=${{marginTop:4,fontSize:12}}>+${cx.num(v.e)} / −${cx.num(v.s)} ${cx.unit} · ${share}% des entrées</p>
            </button>`;
          })}
        </div>
      </section>

      <section class="card pad">
        <div class="flex items-center justify-between gap-2" style=${{marginBottom:12}}>
          <h2>Alertes rapides</h2>
          <span class="pill" style=${{background:S.alerts.length?'var(--crit-soft)':'var(--ok-soft)',color:S.alerts.length?'var(--crit)':'var(--ok)'}}>${S.alerts.length}</span>
        </div>
        ${S.alerts.length===0?html`<p class="muted">Rien à signaler : contrats signés, soldes à jour, stocks suffisants.</p>`:html`<div class="flex flex-col gap-2" style=${{maxHeight:420,overflowY:'auto'}}>
          ${S.alerts.map((a,i)=>html`<button key=${i} onClick=${()=>props.goAlert(a)} style=${{textAlign:'left',display:'flex',gap:10,alignItems:'flex-start',background:sevStyle[a.sev].bg,border:0,borderRadius:10,padding:'9px 11px',cursor:'pointer',font:'inherit',color:'var(--ink)'}}>
            <span style=${{color:sevStyle[a.sev].fg,marginTop:2}}><${Icon} name=${a.icon} size=${16} /></span>
            <span style=${{minWidth:0}}>
              <span style=${{display:'block',fontWeight:700,fontSize:13,overflowWrap:'anywhere'}}>${a.title}</span>
              <span class="num" style=${{display:'block',fontSize:12,color:'var(--muted)'}}>${a.detailKind==='amt'?cx.fm(a.detail)+a.detailSuffix:a.detail}</span>
            </span>
          </button>`)}
        </div>`}
      </section>
    </div>

    <div class="grid gap-3 lg:grid-cols-2" style=${{marginTop:12}}>
      <section class="card pad">
        <div class="flex items-center justify-between gap-2" style=${{marginBottom:12}}>
          <h2>Créances clients</h2>
          <button class="btn btn-ghost btn-sm" onClick=${()=>go('crm')}>Clients <${Icon} name="ChevronRight" size=${14} /></button>
        </div>
        ${creances.length===0?html`<p class="muted">Aucun solde à encaisser sur les dossiers actifs.</p>`:html`<div class="flex flex-col">
          ${creances.map((c,i)=>html`<div key=${c.id} class="flex flex-wrap items-center justify-between gap-2" style=${{padding:'10px 0',borderTop:i?'1px solid var(--line)':'0'}}>
            <div style=${{minWidth:0,flex:'1 1 180px'}}>
              <p style=${{fontWeight:700,overflowWrap:'anywhere'}}>${c.nom}</p>
              <p class="muted num" style=${{fontSize:12.5}}>Budget ${cx.fm(Number(c.budget)||0)} · encaissé ${cx.fm(S.enc[c.id]||0)}</p>
            </div>
            <${Amt} className="r" style=${{fontWeight:800}} v=${S.resteOf(c)} />
            <div class="flex gap-1">
              <button class="btn btn-gold btn-sm" onClick=${()=>props.onNewTx({categorie:CAT_PREST,type:'entree',clientId:c.id,libelle:'Acompte — '+c.nom})}><${Icon} name="Plus" size=${13} /> Encaisser</button>
              <button class="icon-btn" onClick=${()=>props.onEditClient(c)} aria-label=${'Modifier '+c.nom}><${Icon} name="Pencil" size=${15} /></button>
            </div>
          </div>`)}
        </div>`}
      </section>

      <section class="card pad">
        <div class="flex items-center justify-between gap-2" style=${{marginBottom:12}}>
          <h2>Prochains événements</h2>
          <button class="btn btn-ghost btn-sm" onClick=${()=>go('projets')}>Projets <${Icon} name="ChevronRight" size=${14} /></button>
        </div>
        ${S.upcoming.length===0?html`<p class="muted">Aucun événement confirmé à venir.</p>`:html`<div class="flex flex-col">
          ${S.upcoming.slice(0,5).map((c,i)=>html`<div key=${c.id} class="flex flex-wrap items-center justify-between gap-2" style=${{padding:'10px 0',borderTop:i?'1px solid var(--line)':'0'}}>
            <div style=${{minWidth:0,flex:'1 1 180px'}}>
              <p style=${{fontWeight:700,overflowWrap:'anywhere'}}>${c.nom}</p>
              <p class="muted" style=${{fontSize:12.5}}>${c.typeEvt||'Événement'} · ${c.ville||'—'} · ${fdate(c.date)}</p>
              <div style=${{marginTop:6}}><${Progress} pct=${S.progress[c.id].pct} h=${6} /><p class="num muted" style=${{fontSize:11.5,marginTop:2}}>Checklist ${S.progress[c.id].pct}% (${S.progress[c.id].done}/${S.progress[c.id].total})</p></div>
            </div>
            <div class="flex flex-col items-end gap-1"><${DayBadge} date=${c.date} /><${Pill} map=${STATUT_STYLE} value=${c.statut} /></div>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-sm" onClick=${()=>props.openProject(c.id)}>Projet</button>
              <button class="icon-btn" onClick=${()=>props.onEditClient(c)} aria-label=${'Modifier '+c.nom}><${Icon} name="Pencil" size=${15} /></button>
            </div>
          </div>`)}
        </div>`}
      </section>
    </div>

    <div class="grid gap-3 lg:grid-cols-2" style=${{marginTop:12}}>
      <section class="card pad">
        <div class="flex items-center justify-between gap-2" style=${{marginBottom:12}}>
          <h2>Ventes & stock</h2>
          <button class="btn btn-ghost btn-sm" onClick=${()=>props.goAlert({tab:'caisse',sub:'catalogue'})}>Catalogue <${Icon} name="ChevronRight" size=${14} /></button>
        </div>
        ${stock.length===0?html`<p class="muted">Aucun article au catalogue.</p>`:html`<div class="flex flex-col">
          ${stock.map((a,i)=>{const low=a.stock<=a.seuil;return html`<div key=${a.id} class="flex flex-wrap items-center justify-between gap-2" style=${{padding:'9px 0',borderTop:i?'1px solid var(--line)':'0'}}>
            <div style=${{minWidth:0,flex:'1 1 160px'}}><p style=${{fontWeight:700,overflowWrap:'anywhere'}}>${a.nom}</p><p class="num muted" style=${{fontSize:12.5}}>Vente ${cx.fm(a.vente)}</p></div>
            <span class="pill num" style=${{background:a.stock===0?'var(--crit-soft)':low?'var(--warn-soft)':'var(--ok-soft)',color:a.stock===0?'var(--crit)':low?'var(--warn)':'var(--ok)'}}>${a.stock===0?'Rupture':'Stock : '+a.stock}</span>
            <button class="btn btn-ghost btn-sm" onClick=${()=>props.goAlert({tab:'caisse',sub:'catalogue'})}>Gérer</button>
          </div>`;})}
        </div>`}
      </section>
      <section class="card pad">
        <h2 style=${{marginBottom:12}}>Pipeline commercial</h2>
        <div class="flex flex-col gap-2">
          ${pipe.map(p=>html`<button key=${p.s} type="button" onClick=${()=>go('crm')} class="flex items-center justify-between gap-2" style=${{background:'transparent',border:0,padding:'2px 0',font:'inherit',cursor:'pointer',color:'inherit'}}>
            <${Pill} map=${STATUT_STYLE} value=${p.s} />
            <span class="num font-display" style=${{fontWeight:700,fontSize:16}}>${p.n}</span>
          </button>`)}
        </div>
      </section>
    </div>

    <div class="card pad" style=${{marginTop:12,display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',justifyContent:'space-between'}}>
      <p class="muted" style=${{fontSize:12.5,maxWidth:560}}>Toutes les données sont modifiables et enregistrées automatiquement sur cet appareil. Les clients, opérations, prestataires et devis affichés sont des exemples de démonstration.</p>
      <div class="flex flex-wrap gap-2">
        ${confirm===''&&html`<button class="btn btn-ghost btn-sm" onClick=${()=>setConfirm('demo')}><${Icon} name="RotateCcw" size=${14} /> Recharger la démo</button>
        <button class="btn btn-ghost btn-sm" onClick=${()=>setConfirm('clear')}><${Icon} name="Trash2" size=${14} /> Repartir de zéro</button>`}
        ${confirm!==''&&html`<span style=${{fontWeight:700,fontSize:13,alignSelf:'center'}}>${confirm==='demo'?'Remplacer toutes les données par la démo ?':'Effacer toutes les données ?'}</span>
        <button class="btn btn-danger btn-sm" onClick=${()=>{if(confirm==='demo')onResetDemo();else onClear();setConfirm('');}}>Confirmer</button>
        <button class="btn btn-ghost btn-sm" onClick=${()=>setConfirm('')}>Annuler</button>`}
      </div>
    </div>
  </div>`;
}

/* ---------- CRM ---------- */
function ClientForm(props){
  const c=props.client;
  const known=c&&VILLES.indexOf(c.ville)>=0&&c.ville!=='Autre';
  const [f,setF]=useState({
    nom:c?c.nom:'',tel:c?c.tel:'',
    villeSel:c?(known?c.ville:(c.ville?'Autre':'Pointe-Noire')):'Pointe-Noire',
    villeAutre:c&&!known&&c.ville&&c.ville!=='Autre'?c.ville:'',
    typeEvt:c?c.typeEvt:TYPES_EVT[0],date:c?c.date:'',budget:c&&c.budget?String(c.budget):'',
    statut:c?c.statut:STATUTS[0],contrat:c?c.contrat:CONTRATS[0],notes:c?c.notes||'':''
  });
  const set=k=>e=>{const v=e.target.value;setF(s=>Object.assign({},s,{[k]:v}));};
  const valid=f.nom.trim().length>0;
  const submit=e=>{
    e.preventDefault();if(!valid)return;
    const ville=f.villeSel==='Autre'?(f.villeAutre.trim()||'Autre'):f.villeSel;
    props.onSave({id:c?c.id:uid(),nom:f.nom.trim(),tel:f.tel.trim(),ville:ville,typeEvt:f.typeEvt,date:f.date,budget:parseInt(f.budget,10)||0,statut:f.statut,contrat:f.contrat,notes:f.notes.trim()});
    props.onClose();
  };
  return html`<${Modal} title=${c?'Modifier la fiche client':'Nouveau client / prospect'} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <${Field} id="cf-nom" label="Nom légal exact (pour le contrat)" cls="sm:col-span-2"><input id="cf-nom" class="input" value=${f.nom} onChange=${set('nom')} placeholder="Ex. : NGOMA Rodrigue" required /><//>
      <${Field} id="cf-tel" label="Téléphone / WhatsApp"><input id="cf-tel" class="input" type="tel" value=${f.tel} onChange=${set('tel')} placeholder="06 000 00 00" inputMode="tel" /><//>
      <${Field} id="cf-ville" label="Ville"><select id="cf-ville" class="input" value=${f.villeSel} onChange=${set('villeSel')}>${VILLES.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      ${f.villeSel==='Autre'&&html`<${Field} id="cf-ville2" label="Précisez la ville" cls="sm:col-span-2"><input id="cf-ville2" class="input" value=${f.villeAutre} onChange=${set('villeAutre')} /><//>`}
      <${Field} id="cf-type" label="Type d'événement"><select id="cf-type" class="input" value=${f.typeEvt} onChange=${set('typeEvt')}>${TYPES_EVT.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      <${Field} id="cf-date" label="Date prévue"><input id="cf-date" class="input" type="date" value=${f.date} onChange=${set('date')} /><//>
      <${Field} id="cf-budget" label="Budget estimé (FCFA)"><input id="cf-budget" class="input num" type="number" min="0" step="10000" inputMode="numeric" value=${f.budget} onChange=${set('budget')} placeholder="3500000" /><//>
      <${Field} id="cf-statut" label="Statut commercial"><select id="cf-statut" class="input" value=${f.statut} onChange=${set('statut')}>${STATUTS.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      <${Field} id="cf-contrat" label="Statut du contrat"><select id="cf-contrat" class="input" value=${f.contrat} onChange=${set('contrat')}>${CONTRATS.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      <${Field} id="cf-notes" label="Notes" cls="sm:col-span-2"><textarea id="cf-notes" class="input" value=${f.notes} onChange=${set('notes')} placeholder="Lieu, nombre d'invités, demandes particulières…"></textarea><//>
      <div class="sm:col-span-2 flex justify-end gap-2" style=${{marginTop:4}}>
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer</button>
      </div>
    </form>
  <//>`;
}
function FraisModal(props){
  const c=props.client;
  const [rows,setRows]=useState(()=>(props.frais||[]).map(f=>({id:f.id,libelle:f.libelle,montant:String(f.montant),on:true})));
  const [mode,setMode]=useState('MTN MoMo');
  const upd=(id,p)=>setRows(r=>r.map(x=>x.id===id?Object.assign({},x,p):x));
  const total=rows.filter(r=>r.on).reduce((sum,r)=>sum+Math.round(pnum(r.montant)),0);
  const submit=e=>{
    e.preventDefault();if(!total)return;
    const items=rows.filter(r=>r.on&&Math.round(pnum(r.montant))>0).map(r=>({libelle:'Frais initiaux — '+r.libelle+' — '+c.nom,montant:Math.round(pnum(r.montant))}));
    props.onSave(c,items,mode);props.onClose();
  };
  return html`<${Modal} title="Encaisser les frais initiaux" onClose=${props.onClose}>
    <form onSubmit=${submit} class="flex flex-col gap-3">
      <p class="muted">Client : <b style=${{color:'var(--ink)'}}>${c.nom}</b>. Ces frais fixes sont non remboursables et dus avant le démarrage. Les montants proposés viennent des réglages et restent modifiables ici.</p>
      ${rows.map(r=>html`<div key=${r.id} class="frow">
        <input type="checkbox" class="check" style=${{marginTop:0}} checked=${r.on} onChange=${e=>upd(r.id,{on:e.target.checked})} aria-label=${'Inclure : '+r.libelle} />
        <input class="input" value=${r.libelle} onChange=${e=>upd(r.id,{libelle:e.target.value})} aria-label="Libellé du frais" />
        <input class="input num" type="number" min="0" step="1000" inputMode="numeric" value=${r.montant} onChange=${e=>upd(r.id,{montant:e.target.value})} aria-label="Montant en FCFA" />
        <${DelBtn} onDelete=${()=>setRows(x=>x.filter(y=>y.id!==r.id))} label="Retirer ce frais" />
      </div>`)}
      <div><button type="button" class="btn btn-ghost btn-sm" onClick=${()=>setRows(x=>x.concat([{id:uid(),libelle:'Autre frais',montant:'0',on:true}]))}><${Icon} name="Plus" size=${14} /> Ajouter un frais</button></div>
      <${Field} id="fr-mode" label="Mode de paiement"><select id="fr-mode" class="input" value=${mode} onChange=${e=>setMode(e.target.value)}>${MODES.map(m=>html`<option key=${m} value=${m}>${m}</option>`)}</select><//>
      ${c.statut==='Lead WhatsApp'&&html`<p class="muted" style=${{fontSize:12.5}}>Le statut passera automatiquement à « Frais initiaux payés ».</p>`}
      <div class="flex items-start justify-between gap-2" style=${{marginTop:4}}>
        <${Amt} className="font-display" style=${{fontSize:18,fontWeight:700}} v=${total} />
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
          <button type="submit" class="btn btn-gold" disabled=${!total}><${Icon} name="Check" size=${16} /> Encaisser</button>
        </div>
      </div>
    </form>
  <//>`;
}
function ClientCard(props){
  const {c,S,api}=props;
  const [del,setDel]=useState(false);
  const paid=S.paid[c.id]||0;
  const budget=Number(c.budget)||0;
  const reste=Math.max(0,budget-paid);
  const pct=budget?Math.min(100,Math.round(paid/budget*100)):0;
  const idx=STATUTS.indexOf(c.statut);
  return html`<article class="card pad flex flex-col gap-3" style=${{padding:16}}>
    <div class="flex items-start justify-between gap-3">
      <div style=${{minWidth:0}}>
        <h3 style=${{overflowWrap:'anywhere'}}>${c.nom}</h3>
        <p class="muted flex flex-wrap items-center gap-x-3 gap-y-1" style=${{fontSize:12.5,marginTop:3}}>
          <span class="flex items-center gap-1"><${Icon} name="MapPin" size=${13} />${c.ville||'—'}</span>
          <span class="flex items-center gap-1"><${Icon} name="CalendarDays" size=${13} />${fdate(c.date)}</span>
        </p>
      </div>
      <${DayBadge} date=${c.statut==='Clôturé'?'':c.date} />
    </div>
    <div>
      <div class="flex gap-1" aria-hidden="true" style=${{marginBottom:6}}>
        ${STATUTS.map((s,i)=>html`<span key=${s} style=${{flex:1,height:5,borderRadius:99,background:i<=idx?'var(--violet)':'#E7E2F0'}}></span>`)}
      </div>
      <div class="flex flex-wrap items-center gap-2"><${Pill} map=${STATUT_STYLE} value=${c.statut} /><${Pill} map=${CONTRAT_STYLE} value=${'Contrat '+c.contrat.toLowerCase()} /></div>
    </div>
    <div class="grid grid-cols-2 gap-x-3 gap-y-1" style=${{fontSize:13}}>
      <p class="muted">Type</p><p style=${{fontWeight:600,overflowWrap:'anywhere'}}>${c.typeEvt||'—'}</p>
      <p class="muted">Téléphone</p><p class="num" style=${{fontWeight:600}}>${c.tel||'—'}</p>
      <p class="muted">Budget estimé</p><${Amt} style=${{fontWeight:700}} v=${budget} />
    </div>
    ${budget>0&&html`<div>
      <div class="bar"><span style=${{width:pct+'%',background:pct>=100?'var(--ok)':'var(--gold)'}}></span></div>
      <div class="grid grid-cols-2 gap-2" style=${{marginTop:8,fontSize:12.5}}><div><p class="muted">Encaissé</p><${Amt} className="pos" style=${{fontWeight:700}} v=${paid} /></div><div><p class="muted">Reste à encaisser</p><${Amt} style=${{fontWeight:800}} v=${reste} /></div></div>
    </div>`}
    ${c.notes&&html`<p class="muted" style=${{fontSize:12.5,overflowWrap:'anywhere'}}>${c.notes}</p>`}
    <${NotesLog} items=${c.notesLog} placeholder="Ajouter une note de suivi…" onChange=${l=>api.patchClient(c.id,{notesLog:l})} />
    <div class="grid grid-cols-2 gap-2">
      <${Field} id=${'st-'+c.id} label="Statut commercial"><select id=${'st-'+c.id} class="input" value=${c.statut} onChange=${e=>api.patchClient(c.id,{statut:e.target.value})}>${STATUTS.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      <${Field} id=${'ct-'+c.id} label="Contrat"><select id=${'ct-'+c.id} class="input" value=${c.contrat} onChange=${e=>api.patchClient(c.id,{contrat:e.target.value})}>${CONTRATS.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
    </div>
    <hr class="divider" />
    ${!del&&html`<div class="flex flex-wrap items-center gap-2">
      ${c.tel&&html`<a class="btn btn-wa btn-sm" href=${waLink(c.tel,c.nom)} target="_blank" rel="noopener noreferrer"><${Icon} name="MessageCircle" size=${14} /> WhatsApp</a>`}
      <button class="btn btn-gold btn-sm" onClick=${()=>props.onFrais(c)}><${Icon} name="Banknote" size=${14} /> Frais initiaux</button>
      <button class="btn btn-ghost btn-sm" onClick=${()=>props.onEncaisser(c)}><${Icon} name="Plus" size=${14} /> Paiement</button>
      <button class="btn btn-ghost btn-sm" onClick=${()=>props.onProject(c.id)}><${Icon} name="ClipboardCheck" size=${14} /> Projet</button>
      <button class="btn btn-ghost btn-sm" onClick=${()=>props.onDevis(c.id)}><${Icon} name="Receipt" size=${14} /> Devis</button>
      <span style=${{marginLeft:'auto'}} class="flex gap-1">
        <button class="icon-btn" onClick=${()=>props.onEdit(c)} aria-label="Modifier"><${Icon} name="Pencil" size=${16} /></button>
        <button class="icon-btn del" onClick=${()=>setDel(true)} aria-label="Supprimer"><${Icon} name="Trash2" size=${16} /></button>
      </span>
    </div>`}
    ${del&&html`<div class="flex flex-wrap items-center gap-2">
      <span style=${{fontWeight:700,fontSize:13}}>Supprimer cette fiche ?</span>
      <button class="btn btn-danger btn-sm" onClick=${()=>api.delClient(c.id)}>Supprimer</button>
      <button class="btn btn-ghost btn-sm" onClick=${()=>setDel(false)}>Annuler</button>
    </div>`}
  </article>`;
}
function CRM(props){
  const {data,S,api}=props;
  const [q,setQ]=useState('');
  const [fs,setFs]=useState('Tous');
  const [edit,setEdit]=useState(null);
  const [frais,setFrais]=useState(null);
  const list=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return data.clients.filter(c=>(fs==='Tous'||c.statut===fs)&&(!qq||(c.nom+' '+(c.tel||'')+' '+(c.ville||'')+' '+(c.typeEvt||'')).toLowerCase().indexOf(qq)>=0))
      .sort((a,b)=>{if(!a.date&&!b.date)return 0;if(!a.date)return 1;if(!b.date)return -1;return a.date<b.date?-1:a.date>b.date?1:0;});
  },[data.clients,q,fs]);
  const counts={};STATUTS.forEach(s=>{counts[s]=data.clients.filter(c=>c.statut===s).length;});
  return html`<div>
    <${PageHead} eyebrow="CRM" title="Clients & Prospects" sub=${data.clients.length+' fiche'+(data.clients.length>1?'s':'')+' · du lead WhatsApp à la clôture du dossier'}>
      <button class="btn btn-primary" onClick=${()=>setEdit({})}><${Icon} name="Plus" size=${16} /> Nouveau client</button>
    <//>
    <div class="flex flex-col gap-3" style=${{marginBottom:14}}>
      <div style=${{position:'relative'}}>
        <span style=${{position:'absolute',left:12,top:11,color:'var(--muted)'}}><${Icon} name="Search" size=${16} /></span>
        <input class="input" style=${{paddingLeft:36}} placeholder="Rechercher un nom, un numéro, une ville…" value=${q} onChange=${e=>setQ(e.target.value)} aria-label="Rechercher un client" />
      </div>
      <div class="chips">
        <button class=${'chip'+(fs==='Tous'?' on':'')} onClick=${()=>setFs('Tous')}>Tous<small>${data.clients.length}</small></button>
        ${STATUTS.map(s=>html`<button key=${s} class=${'chip'+(fs===s?' on':'')} onClick=${()=>setFs(s)}>${s}<small>${counts[s]}</small></button>`)}
      </div>
    </div>
    ${list.length===0?html`<${Empty} icon="Users" title=${data.clients.length?'Aucun résultat':'Aucun client pour le moment'} text=${data.clients.length?'Essayez un autre nom ou un autre statut.':'Ajoutez votre premier prospect reçu par WhatsApp.'} />`:html`<div class="grid gap-3 xl:grid-cols-2">
      ${list.map(c=>html`<${ClientCard} key=${c.id} c=${c} S=${S} api=${api} onEdit=${setEdit} onFrais=${setFrais} onProject=${props.onProject} onDevis=${props.onDevis} onEncaisser=${cl=>props.onNewTx({categorie:CAT_PREST,type:'entree',clientId:cl.id,libelle:'Acompte — '+cl.nom})} />`)}
    </div>`}
    ${edit&&html`<${ClientForm} client=${edit.id?edit:null} onSave=${api.saveClient} onClose=${()=>setEdit(null)} />`}
    ${frais&&html`<${FraisModal} client=${frais} frais=${props.fraisDefaut} onSave=${api.addFrais} onClose=${()=>setFrais(null)} />`}
  </div>`;
}

function TxModal(props){
  const old=props.tx||null;
  const p=props.prefill||{};
  const link=old?(old.vente||old.reappro||null):null;
  const art=link?props.articles.find(a=>a.id===link.articleId):null;
  const [f,setF]=useState(old?{type:old.entree>0?'entree':'sortie',date:old.date,libelle:old.libelle,categorie:old.categorie,mode:old.mode,montant:String(old.entree||old.sortie||''),clientId:old.clientId||'',prestaId:old.prestaId||'',ref:old.ref||'',qte:link?String(link.qte):''}
    :{type:p.type||'entree',date:todayISO(),libelle:p.libelle||'',categorie:p.categorie||CAT_PREST,mode:p.mode||'MTN MoMo',montant:p.montant?String(p.montant):'',clientId:p.clientId||'',prestaId:p.prestaId||'',ref:'',qte:''});
  const set=k=>e=>{const v=e.target.value;setF(s=>Object.assign({},s,{[k]:v}));};
  const setType=t=>setF(s=>Object.assign({},s,{type:t,categorie:t==='entree'?(s.categorie===CAT_VENTE?s.categorie:CAT_PREST):(['Achat Stock/Fournitures','Frais Généraux',CAT_PRESTA].indexOf(s.categorie)>=0?s.categorie:CAT_PRESTA)}));
  const montant=Math.round(pnum(f.montant));
  const qte=parseInt(f.qte,10)||0;
  const maxQ=old&&old.vente&&art?art.stock+old.vente.qte:Infinity;
  const qOk=!link||(qte>=1&&qte<=maxQ);
  const valid=f.libelle.trim().length>0&&montant>0&&!!f.date&&qOk;
  const showClient=!link&&[CAT_PREST,CAT_PRESTA,'Frais Généraux'].indexOf(f.categorie)>=0;
  const showPresta=!link&&f.categorie===CAT_PRESTA;
  const submit=e=>{
    e.preventDefault();if(!valid)return;
    const tx=Object.assign({},old||{},{date:f.date,libelle:f.libelle.trim(),categorie:f.categorie,mode:f.mode,entree:f.type==='entree'?montant:0,sortie:f.type==='sortie'?montant:0});
    if(old){tx.ref=f.ref.trim()||old.ref;if(old.vente)tx.vente={articleId:old.vente.articleId,qte:qte};if(old.reappro)tx.reappro={articleId:old.reappro.articleId,qte:qte};}
    if(showClient&&f.clientId)tx.clientId=f.clientId;else delete tx.clientId;
    if(showPresta&&f.prestaId)tx.prestaId=f.prestaId;else delete tx.prestaId;
    props.onSave(tx);props.onClose();
  };
  return html`<${Modal} title=${old?"Modifier l'opération":'Nouvelle opération de caisse'} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <div class="sm:col-span-2 segbtn">
        <button type="button" class=${f.type==='entree'?'on':''} disabled=${!!link} onClick=${()=>setType('entree')}><${Icon} name="ArrowDownLeft" size=${16} /> Entrée (+)</button>
        <button type="button" class=${f.type==='sortie'?'on':''} disabled=${!!link} onClick=${()=>setType('sortie')}><${Icon} name="ArrowUpRight" size=${16} /> Sortie (−)</button>
      </div>
      <${Field} id="tx-date" label="Date"><input id="tx-date" class="input" type="date" value=${f.date} onChange=${set('date')} /><//>
      <${Field} id="tx-montant" label="Montant (FCFA)"><input id="tx-montant" class="input num" type="number" min="0" step="500" inputMode="numeric" value=${f.montant} onChange=${set('montant')} placeholder="150000" /><//>
      <div class="sm:col-span-2" style=${{marginTop:-6}}>${montant>0&&html`<${Eq} v=${montant} style=${{fontSize:12.5}} />`}</div>
      <${Field} id="tx-lib" label="Libellé" cls="sm:col-span-2"><input id="tx-lib" class="input" value=${f.libelle} onChange=${set('libelle')} placeholder="Ex. : Acompte 2 — mariage MBEMBA" /><//>
      <${Field} id="tx-cat" label="Catégorie"><select id="tx-cat" class="input" value=${f.categorie} onChange=${set('categorie')} disabled=${!!link}>${CATS.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      <${Field} id="tx-mode" label="Mode de paiement"><select id="tx-mode" class="input" value=${f.mode} onChange=${set('mode')}>${MODES.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      ${link&&html`<${Field} id="tx-qte" label=${'Quantité '+(old.vente?'vendue':'achetée')+(art?' — '+art.nom:'')} cls="sm:col-span-2"><input id="tx-qte" class="input num" type="number" min="1" inputMode="numeric" value=${f.qte} onChange=${set('qte')} />
        <p class="muted" style=${{fontSize:12,marginTop:4}}>Modifier la quantité ajuste automatiquement le stock de l'article.${old.vente&&art?' Maximum possible : '+maxQ+'.':''}</p><//>`}
      ${showClient&&html`<${Field} id="tx-client" label="Dossier client (optionnel)" cls=${showPresta?'':'sm:col-span-2'}><select id="tx-client" class="input" value=${f.clientId} onChange=${set('clientId')}>
        <option value="">— Aucun —</option>${props.clients.map(c=>html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select><//>`}
      ${showPresta&&html`<${Field} id="tx-presta" label="Prestataire payé"><select id="tx-presta" class="input" value=${f.prestaId} onChange=${set('prestaId')}>
        <option value="">— Aucun —</option>${props.prestas.map(c=>html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select><//>`}
      ${showPresta&&html`<p class="sm:col-span-2 muted" style=${{fontSize:12}}>Choisissez le prestataire et le dossier client pour suivre l'acompte et le solde dû dans l'onglet Prestataires.</p>`}
      ${old&&html`<${Field} id="tx-ref" label="Référence" cls="sm:col-span-2"><input id="tx-ref" class="input mono" value=${f.ref} onChange=${set('ref')} /><//>`}
      <div class="sm:col-span-2 flex justify-end gap-2" style=${{marginTop:4}}>
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer</button>
      </div>
    </form>
  <//>`;
}
function ExportModal(props){
  const cx=useCx();
  const csv=useMemo(()=>buildCsv(props.rows,cx.rates),[props.rows,cx.rates]);
  const dl=useDownloads();
  const ta=useRef(null);
  const fname='journal-caisse-axelog-'+todayISO()+'.csv';
  const download=async()=>{
    if(!dl)return;
    try{await dl.save({filename:fname,data:csv});props.notify('Fichier CSV prêt');}
    catch(e){if(e&&e.code==='declined')return;props.notify('Téléchargement indisponible ici : utilisez « Copier le CSV »');}
  };
  const copy=async()=>{
    try{await navigator.clipboard.writeText(csv);props.notify('CSV copié dans le presse-papiers');}
    catch(e){if(ta.current){ta.current.focus();ta.current.select();}props.notify('Texte sélectionné : copiez-le avec Ctrl/Cmd + C');}
  };
  return html`<${Modal} title="Exporter le journal de caisse (.csv)" onClose=${props.onClose} wide=${true}>
    <div class="flex flex-col gap-3">
      <p class="muted">${props.rows.length} ligne${props.rows.length>1?'s':''}, séparateur point-virgule et encodage UTF-8 : le fichier s'ouvre directement dans Excel en français. Les montants restent en FCFA ; le solde est aussi converti en EUR et USD aux taux actuels (1 € = ${nf2.format(cx.rates.eur)} FCFA, 1 $ = ${nf2.format(cx.rates.usd)} FCFA).</p>
      <div class="flex flex-wrap gap-2">
        ${dl&&html`<button class="btn btn-primary" onClick=${download}><${Icon} name="Download" size=${16} /> Télécharger le fichier .csv</button>`}
        <button class=${'btn '+(dl?'btn-ghost':'btn-primary')} onClick=${copy}><${Icon} name="Copy" size=${16} /> Copier le CSV</button>
      </div>
      <textarea ref=${ta} class="input mono" readOnly=${true} wrap="off" style=${{minHeight:220,whiteSpace:'pre'}} value=${csv.replace(/^﻿/,'')} aria-label="Contenu CSV"></textarea>
      ${!dl&&dl!==undefined&&html`<p class="muted" style=${{fontSize:12.5}}>Le téléchargement direct n'est pas disponible dans cet affichage. Copiez le texte, collez-le dans un éditeur et enregistrez-le en « .csv », ou importez-le dans Excel (Données, Depuis un fichier texte).</p>`}
    </div>
  <//>`;
}
function ArticleForm(props){
  const a=props.article;
  const [f,setF]=useState({nom:a?a.nom:'',achat:a?String(a.achat):'',vente:a?String(a.vente):'',stock:a?String(a.stock):'0',seuil:a?String(a.seuil):'3'});
  const set=k=>e=>{const v=e.target.value;setF(s=>Object.assign({},s,{[k]:v}));};
  const valid=f.nom.trim().length>0&&(parseInt(f.vente,10)||0)>0;
  const submit=e=>{
    e.preventDefault();if(!valid)return;
    props.onSave({id:a?a.id:uid(),nom:f.nom.trim(),achat:parseInt(f.achat,10)||0,vente:parseInt(f.vente,10)||0,stock:Math.max(0,parseInt(f.stock,10)||0),seuil:Math.max(0,parseInt(f.seuil,10)||0)});
    props.onClose();
  };
  const marge=(parseInt(f.vente,10)||0)-(parseInt(f.achat,10)||0);
  return html`<${Modal} title=${a?"Modifier l'article":'Nouvel article'} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <${Field} id="ar-nom" label="Nom de l'article" cls="sm:col-span-2"><input id="ar-nom" class="input" value=${f.nom} onChange=${set('nom')} placeholder="Ex. : Pagne wax 6 yards" /><//>
      <${Field} id="ar-achat" label="Prix d'achat (FCFA)"><input id="ar-achat" class="input num" type="number" min="0" inputMode="numeric" value=${f.achat} onChange=${set('achat')} /><//>
      <${Field} id="ar-vente" label="Prix de vente (FCFA)"><input id="ar-vente" class="input num" type="number" min="0" inputMode="numeric" value=${f.vente} onChange=${set('vente')} /><//>
      <${Field} id="ar-stock" label="Stock"><input id="ar-stock" class="input num" type="number" min="0" inputMode="numeric" value=${f.stock} onChange=${set('stock')} /><//>
      <${Field} id="ar-seuil" label="Seuil d'alerte stock bas"><input id="ar-seuil" class="input num" type="number" min="0" inputMode="numeric" value=${f.seuil} onChange=${set('seuil')} /><//>
      <p class="sm:col-span-2 muted num" style=${{fontSize:12.5}}>Marge unitaire : <b style=${{color:marge>=0?'var(--ok)':'var(--crit)'}}>${fcfa(marge)}</b></p>
      <div class="sm:col-span-2 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer</button>
      </div>
    </form>
  <//>`;
}
function SaleModal(props){
  const a=props.article;
  const [qte,setQte]=useState('1');
  const [mode,setMode]=useState('Espèces');
  const [date,setDate]=useState(todayISO());
  const [acheteur,setAcheteur]=useState('');
  const n=parseInt(qte,10)||0;
  const valid=n>=1&&n<=a.stock&&!!date;
  const submit=e=>{e.preventDefault();if(!valid)return;props.onSave({articleId:a.id,qte:n,mode:mode,date:date,acheteur:acheteur.trim()});props.onClose();};
  return html`<${Modal} title=${'Vendre : '+a.nom} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <p class="sm:col-span-2 muted num">Prix unitaire <b style=${{color:'var(--ink)'}}>${fcfa(a.vente)}</b> · stock disponible <b style=${{color:'var(--ink)'}}>${a.stock}</b></p>
      <${Field} id="sv-qte" label="Quantité"><input id="sv-qte" class="input num" type="number" min="1" max=${a.stock} inputMode="numeric" value=${qte} onChange=${e=>setQte(e.target.value)} /><//>
      <${Field} id="sv-date" label="Date"><input id="sv-date" class="input" type="date" value=${date} onChange=${e=>setDate(e.target.value)} /><//>
      <${Field} id="sv-mode" label="Mode de paiement"><select id="sv-mode" class="input" value=${mode} onChange=${e=>setMode(e.target.value)}>${MODES.map(m=>html`<option key=${m} value=${m}>${m}</option>`)}</select><//>
      <${Field} id="sv-ach" label="Acheteur (optionnel)"><input id="sv-ach" class="input" value=${acheteur} onChange=${e=>setAcheteur(e.target.value)} placeholder="Nom ou téléphone" /><//>
      ${n>a.stock&&html`<p class="sm:col-span-2" style=${{color:'var(--crit)',fontWeight:700,fontSize:13}}>Quantité supérieure au stock disponible.</p>`}
      <div class="sm:col-span-2 flex items-center justify-between gap-2">
        <b class="num font-display" style=${{fontSize:18}}>${fcfa(a.vente*n)}</b>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
          <button type="submit" class="btn btn-gold" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer la vente</button>
        </div>
      </div>
      <p class="sm:col-span-2 muted" style=${{fontSize:12.5}}>Le stock est mis à jour et l'entrée est ajoutée au journal de caisse.</p>
    </form>
  <//>`;
}
function RestockModal(props){
  const a=props.article;
  const [qte,setQte]=useState('10');
  const [mode,setMode]=useState('Espèces');
  const [date,setDate]=useState(todayISO());
  const n=parseInt(qte,10)||0;
  const valid=n>=1&&!!date;
  const submit=e=>{e.preventDefault();if(!valid)return;props.onSave({articleId:a.id,qte:n,mode:mode,date:date});props.onClose();};
  return html`<${Modal} title=${'Réapprovisionner : '+a.nom} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <p class="sm:col-span-2 muted num">Prix d'achat unitaire <b style=${{color:'var(--ink)'}}>${fcfa(a.achat)}</b> · stock actuel <b style=${{color:'var(--ink)'}}>${a.stock}</b></p>
      <${Field} id="rs-qte" label="Quantité reçue"><input id="rs-qte" class="input num" type="number" min="1" inputMode="numeric" value=${qte} onChange=${e=>setQte(e.target.value)} /><//>
      <${Field} id="rs-date" label="Date"><input id="rs-date" class="input" type="date" value=${date} onChange=${e=>setDate(e.target.value)} /><//>
      <${Field} id="rs-mode" label="Mode de paiement" cls="sm:col-span-2"><select id="rs-mode" class="input" value=${mode} onChange=${e=>setMode(e.target.value)}>${MODES.map(m=>html`<option key=${m} value=${m}>${m}</option>`)}</select><//>
      <div class="sm:col-span-2 flex items-center justify-between gap-2">
        <b class="num font-display" style=${{fontSize:18}}>${fcfa(a.achat*n)}</b>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
          <button type="submit" class="btn btn-primary" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer l'achat</button>
        </div>
      </div>
      <p class="sm:col-span-2 muted" style=${{fontSize:12.5}}>Le stock augmente et la sortie est inscrite en « Achat Stock/Fournitures ».</p>
    </form>
  <//>`;
}
function Journal(props){
  const {data,S,api,jf}=props;
  const cx=useCx();
  const [q,setQ]=useState('');
  const [fc,setFc]=useState(jf&&jf.cat?jf.cat:'');
  const [fm,setFm]=useState(jf&&jf.mode?jf.mode:'');
  const [lim,setLim]=useState(40);
  const [exp,setExp]=useState(false);
  useEffect(()=>{if(jf){setFc(jf.cat||'');setFm(jf.mode||'');setQ('');setLim(40);}},[jf&&jf.n]);
  const all=useMemo(()=>ledger(data.transactions),[data.transactions]);
  const rows=useMemo(()=>{
    const qq=q.trim().toLowerCase();
    return all.filter(r=>(!fc||r.categorie===fc)&&(!fm||r.mode===fm)&&(!qq||(r.libelle+' '+r.ref).toLowerCase().indexOf(qq)>=0));
  },[all,q,fc,fm]);
  const shown=rows.slice().reverse().slice(0,lim);
  const filtered=!!(q||fc||fm);
  const fe=rows.reduce((s,r)=>s+r.entree,0),fs=rows.reduce((s,r)=>s+r.sortie,0);
  const actions=r=>html`<span class="flex items-center justify-end gap-1">
    <button type="button" class="icon-btn" onClick=${()=>props.onEditTx(r)} aria-label="Modifier l'opération"><${Icon} name="Pencil" size=${15} /></button>
    <${DelBtn} onDelete=${()=>api.delTx(r.id)} label="Supprimer l'opération" />
  </span>`;
  return html`<div class="flex flex-col gap-3">
    <div class="grid gap-3 sm:grid-cols-3">
      <div class="card kpi-hero pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Solde de caisse</p><${Amt} className="font-display" style=${{fontSize:22,fontWeight:700,marginTop:4}} v=${S.solde} /></div>
      <div class="card pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Total des entrées</p><${Amt} className="font-display pos" style=${{fontSize:19,fontWeight:700,marginTop:4}} v=${S.ent} sign=${true} /></div>
      <div class="card pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Total des sorties</p><${Amt} className="font-display neg" style=${{fontSize:19,fontWeight:700,marginTop:4}} v=${S.sor} /></div>
    </div>
    <div class="flex flex-wrap gap-2">
      <div style=${{position:'relative',flex:'1 1 220px'}}>
        <span style=${{position:'absolute',left:12,top:11,color:'var(--muted)'}}><${Icon} name="Search" size=${16} /></span>
        <input class="input" style=${{paddingLeft:36}} placeholder="Rechercher un libellé ou une référence" value=${q} onChange=${e=>{setQ(e.target.value);setLim(40);}} aria-label="Rechercher dans le journal" />
      </div>
      <select class="input" style=${{flex:'1 1 170px',width:'auto'}} value=${fc} onChange=${e=>{setFc(e.target.value);setLim(40);}} aria-label="Filtrer par catégorie"><option value="">Toutes les catégories</option>${CATS.map(c=>html`<option key=${c} value=${c}>${c}</option>`)}</select>
      <select class="input" style=${{flex:'1 1 150px',width:'auto'}} value=${fm} onChange=${e=>{setFm(e.target.value);setLim(40);}} aria-label="Filtrer par mode de paiement"><option value="">Tous les modes</option>${MODES.map(m=>html`<option key=${m} value=${m}>${m}</option>`)}</select>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-primary" onClick=${()=>props.onNewTx(null)}><${Icon} name="Plus" size=${16} /> Nouvelle opération</button>
      <button class="btn btn-ghost" onClick=${()=>setExp(true)} disabled=${rows.length===0}><${Icon} name="Download" size=${16} /> Exporter en .csv</button>
      ${filtered&&html`<button class="btn btn-ghost" onClick=${()=>{setQ('');setFc('');setFm('');}}>Effacer les filtres</button>`}
    </div>
    ${filtered&&rows.length>0&&html`<div class="card flex flex-wrap items-start gap-x-6 gap-y-2" style=${{padding:'10px 14px'}}>
      <span class="muted" style=${{fontWeight:700}}>Sélection (${rows.length} ligne${rows.length>1?'s':''})</span>
      <span class="flex items-start gap-2"><span class="muted">Entrées</span><${Amt} className="pos" style=${{fontWeight:700}} v=${fe} /></span>
      <span class="flex items-start gap-2"><span class="muted">Sorties</span><${Amt} className="neg" style=${{fontWeight:700}} v=${fs} /></span>
      <span class="flex items-start gap-2"><span class="muted">Net</span><${Amt} style=${{fontWeight:800}} v=${fe-fs} /></span>
    </div>`}
    ${rows.length===0?html`<${Empty} icon="Wallet" title=${data.transactions.length?'Aucune opération pour ce filtre':'Le journal est vide'} text=${data.transactions.length?'Modifiez la recherche ou les filtres.':'Enregistrez une entrée ou une sortie pour démarrer.'} />`:html`
    <div class="card hide-sm scroll-x">
      <table class="tbl">
        <thead><tr><th>Date</th><th>Réf.</th><th>Libellé</th><th>Catégorie</th><th>Mode</th><th class="r">Entrée (+) ${cx.unit}</th><th class="r">Sortie (−) ${cx.unit}</th><th class="r">Solde ${cx.unit}</th><th></th></tr></thead>
        <tbody>
          ${shown.map(r=>html`<tr key=${r.id}>
            <td class="num" style=${{whiteSpace:'nowrap'}}>${fdate(r.date)}</td>
            <td class="num mono" style=${{whiteSpace:'nowrap'}}>${r.ref}</td>
            <td style=${{minWidth:220}}>${r.libelle}</td>
            <td><span class="pill" style=${{background:r.categorie===CAT_VENTE?'var(--gold-soft)':r.categorie===CAT_PREST?'var(--violet-soft)':'#ECEAF1',color:r.categorie===CAT_VENTE?'#7A5F0A':r.categorie===CAT_PREST?'var(--violet)':'var(--muted)'}}>${r.categorie}</span></td>
            <td style=${{whiteSpace:'nowrap'}}>${r.mode}</td>
            <td class="r num pos" style=${{fontWeight:700,whiteSpace:'nowrap'}}>${r.entree?'+ '+cx.num(r.entree):''}</td>
            <td class="r num neg" style=${{fontWeight:700,whiteSpace:'nowrap'}}>${r.sortie?'− '+cx.num(r.sortie):''}</td>
            <td class=${'r num '+(r.solde<0?'neg':'')} style=${{fontWeight:800,whiteSpace:'nowrap'}}>${cx.num(r.solde)}</td>
            <td class="r" style=${{whiteSpace:'nowrap'}}>${actions(r)}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>
    <div class="show-sm-only flex flex-col gap-2">
      ${shown.map(r=>html`<div key=${r.id} class="card" style=${{padding:'12px 14px'}}>
        <div class="flex items-start justify-between gap-3">
          <div style=${{minWidth:0}}>
            <p style=${{fontWeight:700,overflowWrap:'anywhere'}}>${r.libelle}</p>
            <p class="muted" style=${{fontSize:12}}>${fdate(r.date)} · ${r.mode}</p>
            <p class="muted" style=${{fontSize:12}}>${r.categorie} · <span class="mono">${r.ref}</span></p>
          </div>
          <div style=${{textAlign:'right',flexShrink:0}}>
            <p class=${'num font-display '+(r.entree?'pos':'neg')} style=${{fontWeight:700,fontSize:16}}>${r.entree?'+ '+cx.fm(r.entree):'− '+cx.fm(r.sortie)}</p>
            <p class="num muted" style=${{fontSize:12}}>Solde ${cx.fm(r.solde)}</p>
          </div>
        </div>
        <div class="flex justify-end" style=${{marginTop:4}}>${actions(r)}</div>
      </div>`)}
    </div>
    ${rows.length>lim&&html`<div class="flex justify-center"><button class="btn btn-ghost" onClick=${()=>setLim(lim+40)}>Afficher plus (${rows.length-lim} restantes)</button></div>`}
    <p class="muted" style=${{fontSize:12}}>Le solde progressif est calculé sur l'ensemble du journal, par ordre chronologique. Toute ligne est modifiable. Supprimer une vente remet les articles en stock.</p>`}
    ${exp&&html`<${ExportModal} rows=${rows} notify=${props.notify} onClose=${()=>setExp(false)} />`}
  </div>`;
}
function Catalogue(props){
  const {data,api}=props;
  const [edit,setEdit]=useState(null);
  const [sale,setSale]=useState(null);
  const [rest,setRest]=useState(null);
  const [del,setDel]=useState('');
  const cx=useCx();
  const valeur=data.articles.reduce((s,a)=>s+a.achat*a.stock,0);
  return html`<div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="muted num">${data.articles.length} article${data.articles.length>1?'s':''} · valeur du stock à l'achat <b style=${{color:'var(--ink)'}}>${cx.fm(valeur)}</b> <span class="muted">(≈ ${cx.others.map(c=>cx.fx(valeur,c)).join(' · ')})</span></p>
      <button class="btn btn-primary" onClick=${()=>setEdit({})}><${Icon} name="Plus" size=${16} /> Nouvel article</button>
    </div>
    ${data.articles.length===0?html`<${Empty} icon="ShoppingBag" title="Catalogue vide" text="Ajoutez les articles que vous vendez en direct." />`:html`<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      ${data.articles.map(a=>{
        const low=a.stock<=a.seuil;const marge=a.vente-a.achat;const mp=a.vente?Math.round(marge/a.vente*100):0;
        return html`<article key=${a.id} class="card flex flex-col gap-3" style=${{padding:16}}>
          <div class="flex items-start justify-between gap-2">
            <h3 style=${{overflowWrap:'anywhere'}}>${a.nom}</h3>
            <span class="pill num" style=${{background:a.stock===0?'var(--crit-soft)':low?'var(--warn-soft)':'var(--ok-soft)',color:a.stock===0?'var(--crit)':low?'var(--warn)':'var(--ok)'}}>${a.stock===0?'Rupture':low?'Stock bas : '+a.stock:'Stock : '+a.stock}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-1" style=${{fontSize:13}}>
            <p class="muted">Prix d'achat</p><p class="num" style=${{fontWeight:600,textAlign:'right'}}>${fcfa(a.achat)}</p>
            <p class="muted">Prix de vente</p><p class="num" style=${{fontWeight:800,textAlign:'right'}}>${fcfa(a.vente)}</p>
            <p class="muted">Marge</p><p class=${'num '+(marge>=0?'pos':'neg')} style=${{fontWeight:700,textAlign:'right'}}>${fcfa(marge)} (${mp}%)</p>
            <p class="muted">Seuil d'alerte</p><p class="num" style=${{textAlign:'right'}}>${a.seuil}</p>
          </div>
          <hr class="divider" />
          ${del!==a.id&&html`<div class="flex flex-wrap items-center gap-2">
            <button class="btn btn-gold btn-sm" disabled=${a.stock===0} onClick=${()=>setSale(a)}><${Icon} name="ShoppingBag" size=${14} /> Vendre</button>
            <button class="btn btn-ghost btn-sm" onClick=${()=>setRest(a)}><${Icon} name="Boxes" size=${14} /> Réappro.</button>
            <span style=${{marginLeft:'auto'}} class="flex gap-1">
              <button class="icon-btn" onClick=${()=>setEdit(a)} aria-label="Modifier"><${Icon} name="Pencil" size=${16} /></button>
              <button class="icon-btn del" onClick=${()=>setDel(a.id)} aria-label="Supprimer"><${Icon} name="Trash2" size=${16} /></button>
            </span>
          </div>`}
          ${del===a.id&&html`<div class="flex flex-wrap items-center gap-2">
            <span style=${{fontWeight:700,fontSize:13}}>Supprimer l'article ?</span>
            <button class="btn btn-danger btn-sm" onClick=${()=>{api.delArticle(a.id);setDel('');}}>Supprimer</button>
            <button class="btn btn-ghost btn-sm" onClick=${()=>setDel('')}>Annuler</button>
          </div>`}
        </article>`;
      })}
    </div>`}
    ${edit&&html`<${ArticleForm} article=${edit.id?edit:null} onSave=${api.saveArticle} onClose=${()=>setEdit(null)} />`}
    ${sale&&html`<${SaleModal} article=${sale} onSave=${api.sell} onClose=${()=>setSale(null)} />`}
    ${rest&&html`<${RestockModal} article=${rest} onSave=${api.restock} onClose=${()=>setRest(null)} />`}
  </div>`;
}
function Caisse(props){
  const {sub,setSub}=props;
  return html`<div>
    <${PageHead} eyebrow="Fichier de caisse" title="Caisse & Ventes d'articles" sub="Journal consolidé de l'événementiel et de la vente directe, ventilé par mode de paiement">
      <button class="btn btn-gold" onClick=${()=>props.onNewTx(null)}><${Icon} name="Plus" size=${16} /> Nouvelle opération</button>
    <//>
    <div class="tabs" role="tablist" style=${{marginBottom:14}}>
      <button role="tab" class=${sub==='journal'?'on':''} onClick=${()=>setSub('journal')}><${Icon} name="Wallet" size=${15} /> Journal de caisse</button>
      <button role="tab" class=${sub==='catalogue'?'on':''} onClick=${()=>setSub('catalogue')}><${Icon} name="ShoppingBag" size=${15} /> Catalogue & ventes</button>
    </div>
    ${sub==='journal'?html`<${Journal} data=${props.data} S=${props.S} api=${props.api} jf=${props.jf} onNewTx=${props.onNewTx} onEditTx=${props.onEditTx} notify=${props.notify} />`:html`<${Catalogue} data=${props.data} api=${props.api} />`}
  </div>`;
}

/* ---------- Projets & Checklists ---------- */
function TaskModal(props){
  const t=props.task;
  const [f,setF]=useState({titre:t?t.titre:'',pole:t?t.pole:(props.pole||POLES[0]),resp:t?t.resp:'',date:t?t.date:'',done:t?!!t.done:false});
  const set=k=>e=>{const v=e.target.value;setF(s=>Object.assign({},s,{[k]:v}));};
  const valid=f.titre.trim().length>0;
  const submit=e=>{
    e.preventDefault();if(!valid)return;
    props.onSave({id:t?t.id:uid(),clientId:t?t.clientId:props.clientId,pole:f.pole,titre:f.titre.trim(),resp:f.resp.trim(),date:f.date,done:f.done});
    props.onClose();
  };
  return html`<${Modal} title=${t?'Modifier la tâche':'Nouvelle tâche'} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <${Field} id="tk-titre" label="Tâche" cls="sm:col-span-2"><input id="tk-titre" class="input" value=${f.titre} onChange=${set('titre')} placeholder="Ex. : Confirmer le traiteur" /><//>
      <${Field} id="tk-pole" label="Pôle"><select id="tk-pole" class="input" value=${f.pole} onChange=${set('pole')}>${POLES.map(p=>html`<option key=${p} value=${p}>${p}</option>`)}</select><//>
      <${Field} id="tk-resp" label="Responsable"><input id="tk-resp" class="input" list="resp-list" value=${f.resp} onChange=${set('resp')} placeholder="Nom ou équipe" />
        <datalist id="resp-list">${props.resps.map(r=>html`<option key=${r} value=${r}></option>`)}</datalist><//>
      <${Field} id="tk-date" label="Échéance"><input id="tk-date" class="input" type="date" value=${f.date} onChange=${set('date')} /><//>
      <label class="flex items-center gap-2" style=${{alignSelf:'end',minHeight:40,cursor:'pointer'}}><input type="checkbox" class="check" style=${{marginTop:0}} checked=${f.done} onChange=${e=>{const v=e.target.checked;setF(s=>Object.assign({},s,{done:v}));}} /> Tâche terminée</label>
      <div class="sm:col-span-2 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer</button>
      </div>
    </form>
  <//>`;
}
function TaskRow(props){
  const t=props.t;
  const late=!t.done&&t.date&&t.date<todayISO();
  return html`<div class=${'task'+(t.done?' done':'')}>
    <input type="checkbox" class="check" checked=${!!t.done} onChange=${()=>props.onToggle(t.id)} aria-label=${'Fait : '+t.titre} />
    <div style=${{minWidth:0,flex:1}}>
      <p class="t-title" style=${{overflowWrap:'anywhere',fontWeight:600}}>${t.titre}</p>
      <p class="muted flex flex-wrap items-center gap-x-3 gap-y-1" style=${{fontSize:12}}>
        ${props.showPole&&html`<span class="flex items-center gap-1"><${Icon} name=${POLE_ICON[t.pole]||'ListChecks'} size=${12} />${t.pole}</span>`}
        ${t.resp&&html`<span class="flex items-center gap-1"><${Icon} name="User" size=${12} />${t.resp}</span>`}
        ${t.date&&html`<span class="flex items-center gap-1" style=${{color:late?'var(--crit)':'inherit',fontWeight:late?700:400}}><${Icon} name="CalendarDays" size=${12} />${fdate(t.date)}${late?' · en retard':''}</span>`}
      </p>
    </div>
    <span class="flex items-center gap-1">
      <button type="button" class="icon-btn" style=${{width:30,height:30}} onClick=${()=>props.onEdit(t)} aria-label=${'Modifier la tâche '+t.titre}><${Icon} name="Pencil" size=${14} /></button>
      <${DelBtn} onDelete=${()=>props.onDelete(t.id)} label=${'Supprimer la tâche '+t.titre} size=${14} />
    </span>
  </div>`;
}
function PoleCard(props){
  const {pole,tasks,api,clientId}=props;
  const [txt,setTxt]=useState('');
  const done=tasks.filter(t=>t.done).length;
  const pct=tasks.length?Math.round(done/tasks.length*100):0;
  const add=e=>{e.preventDefault();const v=txt.trim();if(!v)return;api.saveTask({id:uid(),clientId:clientId,pole:pole,titre:v,resp:'',date:'',done:false},true);setTxt('');};
  const sorted=tasks.slice().sort((a,b)=>(a.done-b.done)||((a.date||'9')<(b.date||'9')?-1:1));
  return html`<section class="card" style=${{padding:14}}>
    <div class="flex items-center justify-between gap-2" style=${{marginBottom:8}}>
      <h3 class="flex items-center gap-2" style=${{fontSize:15}}><span style=${{width:28,height:28,borderRadius:8,background:'var(--violet-soft)',color:'var(--violet)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><${Icon} name=${POLE_ICON[pole]} size=${15} /></span>${pole}</h3>
      <span class="pill num" style=${{background:pct===100?'var(--ok-soft)':'var(--violet-soft)',color:pct===100?'var(--ok)':'var(--violet)'}}>${done}/${tasks.length} · ${pct}%</span>
    </div>
    <${Progress} pct=${pct} h=${6} />
    <div style=${{marginTop:6}}>
      ${sorted.length===0&&html`<p class="muted" style=${{fontSize:12.5,padding:'8px 0'}}>Aucune tâche pour ce pôle.</p>`}
      ${sorted.map(t=>html`<${TaskRow} key=${t.id} t=${t} onToggle=${api.toggleTask} onEdit=${props.onEdit} onDelete=${api.delTask} />`)}
    </div>
    <form onSubmit=${add} class="flex gap-2" style=${{marginTop:8}}>
      <input class="input" style=${{minHeight:36}} value=${txt} onChange=${e=>setTxt(e.target.value)} placeholder="Ajouter une tâche et valider" aria-label=${'Ajouter une tâche au pôle '+pole} />
      <button type="submit" class="btn btn-ghost btn-sm" disabled=${!txt.trim()} aria-label="Ajouter"><${Icon} name="Plus" size=${14} /></button>
    </form>
  </section>`;
}
function ProjectDetail(props){
  const {data,S,api,c}=props;
  const cx=useCx();
  const [edit,setEdit]=useState(null);
  const tasks=data.tasks.filter(t=>t.clientId===c.id);
  const pr=S.progress[c.id]||{total:0,done:0,pct:0,late:0};
  const resps=useMemo(()=>{const s={};data.tasks.forEach(t=>{if(t.resp)s[t.resp]=1;});Object.keys(DEMO_RESP).forEach(k=>{s[DEMO_RESP[k]]=1;});s['Jessica']=1;return Object.keys(s);},[data.tasks]);
  const retro=tasks.slice().sort((a,b)=>(a.date||'9999')<(b.date||'9999')?-1:(a.date||'9999')>(b.date||'9999')?1:0);
  const jourJ=c.date;
  const devis=data.devis.filter(d=>d.clientId===c.id);
  const assigns=S.assignRows.filter(a=>a.clientId===c.id);
  const budget=Number(c.budget)||0;
  const rel=t=>{if(!t.date||!jourJ)return '';const n=Math.round((parseD(t.date)-parseD(jourJ))/86400000);return n===0?'Jour J':(n<0?'J-'+Math.abs(n):'J+'+n);};
  let jjInserted=false;
  const timeline=[];
  retro.forEach(t=>{
    if(jourJ&&!jjInserted&&(!t.date||t.date>jourJ)){timeline.push({jj:true});jjInserted=true;}
    timeline.push({t:t});
  });
  if(jourJ&&!jjInserted)timeline.push({jj:true});
  return html`<div>
    <button class="btn btn-ghost btn-sm" onClick=${()=>props.onBack()} style=${{marginBottom:12}}><${Icon} name="ArrowLeft" size=${14} /> Tous les projets</button>
    <${PageHead} eyebrow=${(c.typeEvt||'Événement')+' · '+(c.ville||'—')} title=${c.nom} sub=${'Date prévue : '+fdate(c.date)}>
      <${DayBadge} date=${c.date} /><${Pill} map=${STATUT_STYLE} value=${c.statut} />
      ${c.tel&&html`<a class="btn btn-wa btn-sm" href=${waLink(c.tel,c.nom)} target="_blank" rel="noopener noreferrer"><${Icon} name="MessageCircle" size=${14} /> WhatsApp</a>`}
      <button class="btn btn-ghost btn-sm" onClick=${()=>props.onEditClient(c)}><${Icon} name="Pencil" size=${14} /> Fiche client</button>
    <//>

    <div class="grid gap-3 lg:grid-cols-3">
      <section class="card pad lg:col-span-2">
        <div class="flex items-end justify-between gap-2" style=${{marginBottom:8}}>
          <div><p class="eyebrow">Avancement global</p><p class="font-display num" style=${{fontSize:30,fontWeight:700,lineHeight:1.1}}>${pr.pct}%</p></div>
          <p class="num muted" style=${{textAlign:'right',fontSize:13}}>${pr.done} / ${pr.total} tâches terminées${pr.late?html`<br /><b style=${{color:'var(--crit)'}}>${pr.late} en retard</b>`:''}</p>
        </div>
        <${Progress} pct=${pr.pct} h=${12} />
        <div class="flex flex-wrap gap-2" style=${{marginTop:14}}>
          <button class="btn btn-primary btn-sm" onClick=${()=>setEdit({})}><${Icon} name="Plus" size=${14} /> Tâche</button>
          <button class="btn btn-gold btn-sm" onClick=${()=>api.genTasks(c,resps)}><${Icon} name="ListChecks" size=${14} /> Ajouter la checklist type</button>
          <button class="btn btn-ghost btn-sm" onClick=${()=>props.openRecap(c.id)}><${Icon} name="FileText" size=${14} /> Récap. financier</button>
          <${ConfirmBtn} label="Vider la checklist" icon="Trash2" disabled=${tasks.length===0} onConfirm=${()=>api.clearTasks(c.id)} />
        </div>
        <p class="muted" style=${{fontSize:12,marginTop:8}}>La checklist type ajoute les tâches des 5 pôles avec des échéances calculées depuis la date de l'événement. Les tâches déjà présentes ne sont pas dupliquées.</p>
      </section>
      <section class="card pad">
        <h2 style=${{marginBottom:10}}>Finances du dossier</h2>
        <div class="grid grid-cols-2 gap-x-3 gap-y-3" style=${{fontSize:13}}>
          <div><p class="muted">Budget</p><${Amt} style=${{fontWeight:700}} v=${budget} /></div>
          <div><p class="muted">Encaissé</p><${Amt} className="pos" style=${{fontWeight:700}} v=${S.enc[c.id]||0} /></div>
          <div><p class="muted">Reste à encaisser</p><${Amt} style=${{fontWeight:700}} v=${S.resteOf(c)} /></div>
          <div><p class="muted">Marge nette réelle</p><${Amt} className=${S.margeOf(c.id)<0?'neg':'pos'} style=${{fontWeight:800}} v=${S.margeOf(c.id)} /></div>
        </div>
      </section>
    </div>

    <div class="grid gap-3 lg:grid-cols-2" style=${{marginTop:12}}>
      <section class="card pad">
        <h2 style=${{marginBottom:4}}>Rétroplanning</h2>
        <p class="muted" style=${{fontSize:12.5,marginBottom:8}}>Toutes les tâches classées par échéance, avec le décompte avant le jour J.</p>
        ${tasks.length===0?html`<p class="muted">Aucune tâche. Ajoutez-en une ou utilisez la checklist type.</p>`:html`<div>
          ${timeline.map((it,i)=>it.jj?html`<div key=${'jj'+i} class="flex items-center gap-2" style=${{padding:'8px 10px',margin:'6px 0',background:'var(--night)',color:'#fff',borderRadius:10}}>
              <${Icon} name="Flag" size=${16} /><b>Jour J — ${fdate(jourJ)}</b></div>`
            :html`<div key=${it.t.id} class="flex items-start gap-2">
              <span class="pill num" style=${{background:'var(--violet-soft)',color:'var(--violet)',marginTop:9,minWidth:52,justifyContent:'center'}}>${rel(it.t)||'—'}</span>
              <div style=${{flex:1,minWidth:0}}><${TaskRow} t=${it.t} showPole=${true} onToggle=${api.toggleTask} onEdit=${setEdit} onDelete=${api.delTask} /></div>
            </div>`)}
        </div>`}
      </section>
      <div class="flex flex-col gap-3">
        <section class="card pad">
          <div class="flex items-center justify-between gap-2" style=${{marginBottom:8}}>
            <h2>Prestataires du dossier</h2>
            <button class="btn btn-ghost btn-sm" onClick=${()=>props.goPresta()}>Suivi <${Icon} name="ChevronRight" size=${14} /></button>
          </div>
          ${assigns.length===0?html`<p class="muted">Aucun prestataire affecté. Utilisez l'onglet Prestataires.</p>`:html`<div class="flex flex-col">
            ${assigns.map((a,i)=>html`<div key=${a.id} class="flex flex-wrap items-center justify-between gap-2" style=${{padding:'8px 0',borderTop:i?'1px solid var(--line)':'0'}}>
              <div style=${{minWidth:0,flex:'1 1 150px'}}><p style=${{fontWeight:700,overflowWrap:'anywhere'}}>${S.pr[a.prestaId].nom}</p><p class="muted" style=${{fontSize:12}}>${a.prestation}</p></div>
              <div style=${{textAlign:'right'}}><p class="muted" style=${{fontSize:11.5}}>Reste dû</p><${Amt} className="r" style=${{fontWeight:700}} v=${a.reste} /></div>
            </div>`)}
          </div>`}
        </section>
        <section class="card pad">
          <div class="flex items-center justify-between gap-2" style=${{marginBottom:8}}>
            <h2>Devis & factures</h2>
            <button class="btn btn-ghost btn-sm" onClick=${()=>props.newDevis(c.id)}><${Icon} name="Plus" size=${14} /> Nouveau devis</button>
          </div>
          ${devis.length===0?html`<p class="muted">Aucun devis pour ce dossier.</p>`:html`<div class="flex flex-col">
            ${devis.map((d,i)=>html`<div key=${d.id} class="flex flex-wrap items-center justify-between gap-2" style=${{padding:'8px 0',borderTop:i?'1px solid var(--line)':'0'}}>
              <div><p style=${{fontWeight:700}}>${d.numero} <span class="pill" style=${{background:'#ECEAF1',color:'var(--muted)',marginLeft:4}}>${d.statut}</span></p><${Amt} style=${{fontSize:12.5}} v=${devisTotals(d).total} /></div>
              <button class="btn btn-ghost btn-sm" onClick=${()=>props.openDevis(d.id)}>Ouvrir</button>
            </div>`)}
          </div>`}
        </section>
      </div>
    </div>

    <h2 style=${{margin:'20px 0 10px'}}>Checklist opérationnelle par pôle</h2>
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      ${POLES.map(p=>html`<${PoleCard} key=${p} pole=${p} clientId=${c.id} tasks=${tasks.filter(t=>t.pole===p)} api=${api} onEdit=${setEdit} />`)}
    </div>
    ${edit&&html`<${TaskModal} task=${edit.id?edit:null} clientId=${c.id} resps=${resps} onSave=${t=>api.saveTask(t)} onClose=${()=>setEdit(null)} />`}
  </div>`;
}
function Projets(props){
  const {data,S,sel,setSel}=props;
  const [flt,setFlt]=useState('actifs');
  const list=data.clients.filter(c=>flt==='tous'?true:flt==='clos'?c.statut==='Clôturé':ACTIFS.indexOf(c.statut)>=0)
    .sort((a,b)=>(a.date||'9')<(b.date||'9')?-1:1);
  const c=sel?data.clients.find(x=>x.id===sel):null;
  if(c)return html`<${ProjectDetail} data=${data} S=${S} api=${props.api} c=${c} onBack=${()=>setSel('')} onEditClient=${props.onEditClient} openRecap=${props.openRecap} goPresta=${props.goPresta} newDevis=${props.newDevis} openDevis=${props.openDevis} />`;
  const counts={actifs:data.clients.filter(x=>ACTIFS.indexOf(x.statut)>=0).length,tous:data.clients.length,clos:data.clients.filter(x=>x.statut==='Clôturé').length};
  return html`<div>
    <${PageHead} eyebrow="Projets événementiels" title="Projets & Checklists" sub="Un projet par événement validé ou en cours : rétroplanning, checklist par pôle et progression" />
    <div class="chips" style=${{marginBottom:14}}>
      <button class=${'chip'+(flt==='actifs'?' on':'')} onClick=${()=>setFlt('actifs')}>Validés / en cours<small>${counts.actifs}</small></button>
      <button class=${'chip'+(flt==='clos'?' on':'')} onClick=${()=>setFlt('clos')}>Clôturés<small>${counts.clos}</small></button>
      <button class=${'chip'+(flt==='tous'?' on':'')} onClick=${()=>setFlt('tous')}>Tous les dossiers<small>${counts.tous}</small></button>
    </div>
    ${list.length===0?html`<${Empty} icon="ClipboardCheck" title="Aucun projet dans cette vue" text="Passez un client en « Devis validé », « Contrat signé » ou « En cours » pour le retrouver ici." />`:html`<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      ${list.map(c=>{
        const pr=S.progress[c.id];
        const byPole=POLES.map(p=>{const ts=data.tasks.filter(t=>t.clientId===c.id&&t.pole===p);return {p:p,n:ts.length,d:ts.filter(t=>t.done).length};});
        return html`<article key=${c.id} class="card pad flex flex-col gap-3" style=${{padding:16}}>
          <div class="flex items-start justify-between gap-2">
            <div style=${{minWidth:0}}><h3 style=${{overflowWrap:'anywhere'}}>${c.nom}</h3>
              <p class="muted" style=${{fontSize:12.5,marginTop:2}}>${c.typeEvt||'Événement'} · ${c.ville||'—'} · ${fdate(c.date)}</p></div>
            <${DayBadge} date=${c.statut==='Clôturé'?'':c.date} />
          </div>
          <${Pill} map=${STATUT_STYLE} value=${c.statut} />
          <div>
            <div class="flex items-baseline justify-between"><b class="font-display num" style=${{fontSize:22}}>${pr.pct}%</b><span class="num muted" style=${{fontSize:12.5}}>${pr.done}/${pr.total} tâches${pr.late?' · '+pr.late+' en retard':''}</span></div>
            <${Progress} pct=${pr.pct} h=${8} />
          </div>
          <div class="flex flex-wrap gap-1">
            ${byPole.map(x=>html`<span key=${x.p} class="pill num" title=${x.p} style=${{background:x.n&&x.d===x.n?'var(--ok-soft)':'#EEEAF5',color:x.n&&x.d===x.n?'var(--ok)':'var(--muted)',fontSize:11}}><${Icon} name=${POLE_ICON[x.p]} size=${11} />${x.d}/${x.n}</span>`)}
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-primary btn-sm" onClick=${()=>setSel(c.id)}>Ouvrir le projet</button>
            ${pr.total===0&&html`<button class="btn btn-gold btn-sm" onClick=${()=>props.api.genTasks(c,{})}>Générer la checklist</button>`}
            <button class="icon-btn" onClick=${()=>props.onEditClient(c)} aria-label=${'Modifier '+c.nom}><${Icon} name="Pencil" size=${15} /></button>
          </div>
        </article>`;
      })}
    </div>`}
  </div>`;
}

/* ---------- téléchargement de fichiers (navigateur) ---------- */
const MIME={html:'text/html;charset=utf-8',csv:'text/csv;charset=utf-8',pdf:'application/pdf',txt:'text/plain;charset=utf-8',md:'text/markdown;charset=utf-8',json:'application/json'};
const DOWNLOADER={
  save:async function(o){
    const ext=(o.filename.split('.').pop()||'').toLowerCase();
    const blob=(typeof o.data==='string')?new Blob([ext==='csv'?'\ufeff':'',o.data],{type:MIME[ext]||'application/octet-stream'}):o.data;
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=o.filename;a.style.display='none';
    document.body.appendChild(a);a.click();
    setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},1500);
  }
};

/* ---------- fichiers prestataires (IndexedDB + Supabase Storage) et notes de suivi ---------- */
const fileStore=(function(){
  let dbp=null;const mem={};
  function open(){
    if(dbp)return dbp;
    dbp=new Promise(res=>{
      try{const r=indexedDB.open('axelog-files',1);r.onupgradeneeded=()=>{r.result.createObjectStore('f');};r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);r.onblocked=()=>res(null);}
      catch(e){res(null);}
    });
    return dbp;
  }
  async function run(mode,fn){
    const db=await open();if(!db)return undefined;
    return new Promise(res=>{
      try{const t=db.transaction('f',mode);const rq=fn(t.objectStore('f'));t.oncomplete=()=>res(rq&&rq.result!==undefined?rq.result:true);t.onerror=()=>res(undefined);t.onabort=()=>res(undefined);}
      catch(e){res(undefined);}
    });
  }
  return {
    put:async(id,blob)=>{mem[id]=blob;const r=await run('readwrite',st=>st.put(blob,id));const c=await cloudFiles.put(id,blob);return r!==undefined||c;},
    get:async id=>{if(mem[id])return mem[id];const r=await run('readonly',st=>st.get(id));if(r&&r!==true){mem[id]=r;return r;}const c=await cloudFiles.get(id);if(c){mem[id]=c;run('readwrite',st=>st.put(c,id));return c;}return null;},
    del:async id=>{delete mem[id];await run('readwrite',st=>st.delete(id));await cloudFiles.del(id);}
  };
})();
const FILE_EXT=['jpg','jpeg','png','webp','gif','pdf','docx','xlsx','pptx','txt','csv','md','zip'];
const FILE_MAX=10*1024*1024;
const FILE_KINDS=['Devis','Contrat','Visuel','Fiche','Autre'];
const isImgName=n=>/\.(jpe?g|png|webp|gif)$/i.test(n||'');
const fsize=n=>n>=1048576?nf2.format(n/1048576)+' Mo':Math.max(1,Math.round(n/1024))+' Ko';
async function compressImage(file){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))return {blob:file,compressed:false};
  let url='';
  try{
    url=URL.createObjectURL(file);
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('img'));i.src=url;});
    const sc=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;
    const ctx=cv.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
    const blob=await new Promise(res=>cv.toBlob(res,'image/jpeg',0.75));
    if(blob&&blob.size<file.size)return {blob:blob,compressed:true};
    return {blob:file,compressed:false};
  }catch(e){return {blob:file,compressed:false};}
  finally{if(url)URL.revokeObjectURL(url);}
}
function FileThumb(props){
  const [url,setUrl]=useState('');
  useEffect(()=>{
    let u='',ok=true;
    fileStore.get(props.f.id).then(b=>{if(ok&&b){u=URL.createObjectURL(b);setUrl(u);}}).catch(()=>{});
    return()=>{ok=false;if(u)URL.revokeObjectURL(u);};
  },[props.f.id]);
  if(!url)return html`<span class="thumb" style=${{display:'inline-flex',alignItems:'center',justifyContent:'center',color:'var(--muted)'}}><${Icon} name="Image" size=${22} /></span>`;
  return html`<button type="button" onClick=${()=>props.onOpen(props.f,url)} style=${{border:0,padding:0,background:'transparent',cursor:'zoom-in'}} aria-label=${'Voir '+props.f.name}><img class="thumb" src=${url} alt=${props.f.name} /></button>`;
}
function PrestaFiles(props){
  const {p,api,notify}=props;
  const dl=useDownloads();
  const [busy,setBusy]=useState(false);
  const [kind,setKind]=useState(FILE_KINDS[0]);
  const [over,setOver]=useState(false);
  const [view,setView]=useState(null);
  const inp=useRef(null);
  const files=p.files||[];
  const handle=async list=>{
    if(!list.length)return;
    setBusy(true);
    const added=[],msgs=[];let before=0,after=0,nComp=0;
    for(const f of list){
      const ext=(f.name.split('.').pop()||'').toLowerCase();
      if(FILE_EXT.indexOf(ext)<0){msgs.push(f.name+' : format non pris en charge');continue;}
      let out={blob:f,compressed:false};
      if(/^image\//.test(f.type))out=await compressImage(f);
      if(out.blob.size>FILE_MAX){msgs.push(f.name+' : fichier trop volumineux (max 10 Mo)');continue;}
      const id=uid()+uid();
      const ok=await fileStore.put(id,out.blob);
      const name=out.compressed?f.name.replace(/\.[^.]+$/,'')+'.jpg':f.name;
      if(out.compressed){nComp++;before+=f.size;after+=out.blob.size;}
      added.push({id:id,name:name,type:out.compressed?'image/jpeg':(f.type||''),size:out.blob.size,orig:f.size,kind:kind,date:todayISO(),saved:ok});
    }
    if(added.length)api.addPrestaFiles(p.id,added);
    setBusy(false);
    let m=added.length?added.length+' fichier'+(added.length>1?'s ajoutés':' ajouté'):'';
    if(nComp)m+=' · '+nComp+' image'+(nComp>1?'s compressées':' compressée')+' ('+fsize(before)+' → '+fsize(after)+')';
    if(added.some(a=>!a.saved))m+=' · conservé pour cette session seulement';
    if(msgs.length)m+=(m?' · ':'')+msgs.join(' · ');
    if(m)notify(m);
  };
  const save=async f=>{
    if(!dl){notify('Téléchargement indisponible dans cet affichage');return;}
    const b=await fileStore.get(f.id);
    if(!b){notify('Fichier introuvable sur cet appareil');return;}
    try{await dl.save({filename:f.name,data:b});}catch(e){if(!e||e.code!=='declined')notify('Téléchargement impossible ici');}
  };
  return html`<div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-end gap-2">
      <div style=${{width:130}}><label class="label" for=${'fk-'+p.id}>Type de fichier</label><select id=${'fk-'+p.id} class="input" style=${{minHeight:36}} value=${kind} onChange=${e=>setKind(e.target.value)}>${FILE_KINDS.map(k=>html`<option key=${k} value=${k}>${k}</option>`)}</select></div>
      <button type="button" class="btn btn-primary btn-sm" disabled=${busy} onClick=${()=>inp.current&&inp.current.click()}><${Icon} name="Upload" size=${14} /> ${busy?'Traitement…':'Ajouter un fichier'}</button>
      ${files.length>0&&html`<${ConfirmBtn} label="Tout supprimer" icon="Trash2" onConfirm=${()=>api.clearPrestaFiles(p.id)} />`}
      <input ref=${inp} type="file" multiple hidden accept="image/*,.pdf,.docx,.xlsx,.pptx,.txt,.csv,.md,.zip" aria-label="Choisir des fichiers" onChange=${e=>{const l=Array.from(e.target.files||[]);e.target.value='';handle(l);}} />
    </div>
    <div class=${'dropzone'+(over?' over':'')} onClick=${()=>inp.current&&inp.current.click()} onDragOver=${e=>{e.preventDefault();setOver(true);}} onDragLeave=${()=>setOver(false)} onDrop=${e=>{e.preventDefault();setOver(false);handle(Array.from(e.dataTransfer.files||[]));}} role="button" tabIndex="0" onKeyDown=${e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inp.current&&inp.current.click();}}}>
      <p style=${{fontWeight:700,fontSize:13}}>Glissez des fichiers ici ou cliquez pour parcourir</p>
      <p style=${{fontSize:12}}>Devis, contrats, photos, fiches (images, PDF, Word, Excel, texte). Les images sont compressées automatiquement.</p>
    </div>
    ${files.length===0?html`<p class="muted" style=${{fontSize:12.5}}>Aucun fichier joint à ce prestataire.</p>`:html`<div class="flex flex-col">
      ${files.map((f,i)=>html`<div key=${f.id} class="flex flex-wrap items-center gap-3" style=${{padding:'8px 0',borderTop:i?'1px solid var(--line)':'0'}}>
        ${isImgName(f.name)?html`<${FileThumb} f=${f} onOpen=${(ff,u)=>setView({f:ff,url:u})} />`:html`<span class="thumb" style=${{display:'inline-flex',alignItems:'center',justifyContent:'center',color:'var(--violet)'}}><${Icon} name="FileText" size=${24} /></span>`}
        <div style=${{minWidth:0,flex:'1 1 150px'}}>
          <p style=${{fontWeight:700,overflowWrap:'anywhere',fontSize:13}}>${f.name}</p>
          <p class="muted num" style=${{fontSize:12}}>${f.kind||'Fichier'} · ${fsize(f.size)}${f.orig&&f.orig>f.size?' (compressé, avant '+fsize(f.orig)+')':''} · ${fdate(f.date)}${f.saved===false?' · session seulement':''}</p>
        </div>
        <span class="flex items-center gap-1">
          ${isImgName(f.name)&&html`<button type="button" class="icon-btn" onClick=${async()=>{const b=await fileStore.get(f.id);if(b)setView({f:f,url:URL.createObjectURL(b),own:true});else notify('Fichier introuvable sur cet appareil');}} aria-label=${'Voir '+f.name}><${Icon} name="Eye" size=${15} /></button>`}
          <button type="button" class="icon-btn" onClick=${()=>save(f)} aria-label=${'Télécharger '+f.name}><${Icon} name="Download" size=${15} /></button>
          <${DelBtn} onDelete=${()=>api.delPrestaFile(p.id,f.id)} label=${'Supprimer le fichier '+f.name} />
        </span>
      </div>`)}
    </div>`}
    ${view&&html`<${Modal} title=${view.f.name} wide=${true} onClose=${()=>{if(view.own)URL.revokeObjectURL(view.url);setView(null);}}>
      <img src=${view.url} alt=${view.f.name} style=${{maxWidth:'100%',borderRadius:10,display:'block',margin:'0 auto'}} />
    <//>`}
  </div>`;
}
function NotesLog(props){
  const [open,setOpen]=useState(false);
  const [txt,setTxt]=useState('');
  const items=props.items||[];
  const shown=props.bare||open;
  const add=e=>{e.preventDefault();const v=txt.trim();if(!v)return;props.onChange([{id:uid(),date:todayISO(),text:v}].concat(items));setTxt('');};
  return html`<div>
    ${!props.bare&&html`<button type="button" class="btn btn-ghost btn-sm" onClick=${()=>setOpen(!open)} aria-expanded=${open}><${Icon} name="FileText" size=${13} /> Notes de suivi (${items.length}) <${Icon} name=${open?'ChevronUp':'ChevronDown'} size=${13} /></button>`}
    ${shown&&html`<div class="flex flex-col gap-2" style=${{marginTop:props.bare?0:8}}>
      <form onSubmit=${add} class="flex gap-2">
        <input class="input" style=${{minHeight:36}} value=${txt} onChange=${e=>setTxt(e.target.value)} placeholder=${props.placeholder||'Ajouter une note…'} aria-label="Nouvelle note" />
        <button type="submit" class="btn btn-ghost btn-sm" disabled=${!txt.trim()}><${Icon} name="Plus" size=${14} /> Ajouter</button>
      </form>
      ${items.length===0&&html`<p class="muted" style=${{fontSize:12.5}}>Aucune note.</p>`}
      ${items.map(n=>html`<div key=${n.id} class="flex items-start justify-between gap-2" style=${{padding:'6px 0',borderTop:'1px solid var(--line)'}}>
        <div style=${{minWidth:0}}><p class="muted" style=${{fontSize:11.5}}>${fdate(n.date)}</p><p style=${{overflowWrap:'anywhere',fontSize:13}}>${n.text}</p></div>
        <${DelBtn} onDelete=${()=>props.onChange(items.filter(x=>x.id!==n.id))} label="Supprimer la note" size=${14} />
      </div>`)}
    </div>`}
  </div>`;
}
/* ---------- Prestataires ---------- */
function PrestaForm(props){
  const p=props.presta;
  const known=p&&VILLES.indexOf(p.ville)>=0&&p.ville!=='Autre';
  const [f,setF]=useState({nom:p?p.nom:'',cat:p?p.cat:(props.cat||PCATS[0]),
    villeSel:p?(known?p.ville:(p.ville?'Autre':'Pointe-Noire')):'Pointe-Noire',villeAutre:p&&!known&&p.ville&&p.ville!=='Autre'?p.ville:'',
    tel:p?p.tel:'',tarif:p?String(p.tarif||''):'',note:p?String(p.note):'3',notes:p?p.notes||'':''});
  const set=k=>e=>{const v=e.target.value;setF(s=>Object.assign({},s,{[k]:v}));};
  const valid=f.nom.trim().length>0;
  const submit=e=>{
    e.preventDefault();if(!valid)return;
    props.onSave({id:p?p.id:uid(),nom:f.nom.trim(),cat:f.cat,ville:f.villeSel==='Autre'?(f.villeAutre.trim()||'Autre'):f.villeSel,tel:f.tel.trim(),tarif:Math.round(pnum(f.tarif)),note:parseInt(f.note,10)||0,notes:f.notes.trim()});
    props.onClose();
  };
  return html`<${Modal} title=${p?'Modifier la fiche prestataire':'Nouveau prestataire'} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <${Field} id="pf-nom" label="Nom du prestataire" cls="sm:col-span-2"><input id="pf-nom" class="input" value=${f.nom} onChange=${set('nom')} placeholder="Ex. : Traiteur Saveurs du Congo" /><//>
      <${Field} id="pf-cat" label="Catégorie"><select id="pf-cat" class="input" value=${f.cat} onChange=${set('cat')}>${PCATS.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      <${Field} id="pf-ville" label="Ville"><select id="pf-ville" class="input" value=${f.villeSel} onChange=${set('villeSel')}>${VILLES.map(v=>html`<option key=${v} value=${v}>${v}</option>`)}</select><//>
      ${f.villeSel==='Autre'&&html`<${Field} id="pf-ville2" label="Précisez la ville" cls="sm:col-span-2"><input id="pf-ville2" class="input" value=${f.villeAutre} onChange=${set('villeAutre')} /><//>`}
      <${Field} id="pf-tel" label="Téléphone / WhatsApp"><input id="pf-tel" class="input" type="tel" inputMode="tel" value=${f.tel} onChange=${set('tel')} placeholder="06 000 00 00" /><//>
      <${Field} id="pf-tarif" label="Tarif indicatif (FCFA)"><input id="pf-tarif" class="input num" type="number" min="0" step="5000" inputMode="numeric" value=${f.tarif} onChange=${set('tarif')} /><//>
      <div class="sm:col-span-2" style=${{marginTop:-6}}>${pnum(f.tarif)>0&&html`<${Eq} v=${pnum(f.tarif)} style=${{fontSize:12.5}} />`}</div>
      <${Field} id="pf-note" label="Note de fiabilité (sur 5)" cls="sm:col-span-2"><select id="pf-note" class="input" value=${f.note} onChange=${set('note')}>${[0,1,2,3,4,5].map(n=>html`<option key=${n} value=${String(n)}>${n===0?'Non noté':n+' / 5'}</option>`)}</select><//>
      <${Field} id="pf-notes" label="Notes" cls="sm:col-span-2"><textarea id="pf-notes" class="input" value=${f.notes} onChange=${set('notes')} placeholder="Capacité, conditions, remarques…"></textarea><//>
      <div class="sm:col-span-2 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer</button>
      </div>
    </form>
  <//>`;
}
function AssignModal(props){
  const a=props.assign;
  const [f,setF]=useState({clientId:a?a.clientId:(props.clientId||(props.clients[0]?props.clients[0].id:'')),prestaId:a?a.prestaId:(props.prestaId||(props.prestas[0]?props.prestas[0].id:'')),prestation:a?a.prestation:'',convenu:a?String(a.convenu||''):''});
  const set=k=>e=>{const v=e.target.value;setF(s=>Object.assign({},s,{[k]:v}));};
  const valid=!!f.clientId&&!!f.prestaId;
  const submit=e=>{
    e.preventDefault();if(!valid)return;
    props.onSave({id:a?a.id:uid(),clientId:f.clientId,prestaId:f.prestaId,prestation:f.prestation.trim()||'Prestation',convenu:Math.round(pnum(f.convenu))});
    props.onClose();
  };
  return html`<${Modal} title=${a?'Modifier l’affectation':'Affecter un prestataire à un événement'} onClose=${props.onClose}>
    <form onSubmit=${submit} class="grid gap-3 sm:grid-cols-2">
      <${Field} id="as-client" label="Événement / client" cls="sm:col-span-2"><select id="as-client" class="input" value=${f.clientId} onChange=${set('clientId')}>${props.clients.map(c=>html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select><//>
      <${Field} id="as-presta" label="Prestataire" cls="sm:col-span-2"><select id="as-presta" class="input" value=${f.prestaId} onChange=${set('prestaId')}>${props.prestas.map(p=>html`<option key=${p.id} value=${p.id}>${p.nom} — ${p.cat}</option>`)}</select><//>
      <${Field} id="as-prest" label="Prestation"><input id="as-prest" class="input" value=${f.prestation} onChange=${set('prestation')} placeholder="Ex. : Traiteur 300 invités" /><//>
      <${Field} id="as-conv" label="Montant convenu (FCFA)"><input id="as-conv" class="input num" type="number" min="0" step="5000" inputMode="numeric" value=${f.convenu} onChange=${set('convenu')} /><//>
      <div class="sm:col-span-2" style=${{marginTop:-6}}>${pnum(f.convenu)>0&&html`<${Eq} v=${pnum(f.convenu)} style=${{fontSize:12.5}} />`}</div>
      ${(props.clients.length===0||props.prestas.length===0)&&html`<p class="sm:col-span-2" style=${{color:'var(--crit)',fontWeight:700,fontSize:13}}>Ajoutez d'abord un client et un prestataire.</p>`}
      <div class="sm:col-span-2 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled=${!valid}><${Icon} name="Check" size=${16} /> Enregistrer</button>
      </div>
    </form>
  <//>`;
}
function AssignBlock(props){
  const {a,S,data,api}=props;
  const cl=S.cl[a.clientId],pr=S.pr[a.prestaId];
  const txs=data.transactions.filter(t=>t.prestaId===a.prestaId&&t.clientId===a.clientId).sort((x,y)=>x.date<y.date?-1:1);
  const st=!(Number(a.convenu)>0)?{t:'Montant à renseigner',bg:'var(--warn-soft)',fg:'var(--warn)'}:a.reste===0?{t:'Soldé',bg:'var(--ok-soft)',fg:'var(--ok)'}:{t:'Reste dû',bg:'var(--crit-soft)',fg:'var(--crit)'};
  return html`<div class="card" style=${{padding:'12px 14px'}}>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div style=${{minWidth:0,flex:'1 1 200px'}}>
        <p style=${{fontWeight:700,overflowWrap:'anywhere'}}>${props.who==='presta'?(cl?cl.nom:'—'):pr.nom}</p>
        <p class="muted" style=${{fontSize:12.5}}>${a.prestation}${props.who==='presta'&&cl?' · '+fdate(cl.date):''}</p>
        <span class="pill" style=${{background:st.bg,color:st.fg,marginTop:6}}>${st.t}</span>
      </div>
      <div class="grid grid-cols-3 gap-3" style=${{fontSize:13,flex:'2 1 330px'}}>
        <div><p class="muted" style=${{fontSize:11.5}}>Convenu</p><${Amt} style=${{fontWeight:700}} v=${Number(a.convenu)||0} /></div>
        <div><p class="muted" style=${{fontSize:11.5}}>Versé</p><${Amt} className="pos" style=${{fontWeight:700}} v=${a.paye} /></div>
        <div><p class="muted" style=${{fontSize:11.5}}>Reste dû</p><${Amt} style=${{fontWeight:800}} v=${a.reste} /></div>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2" style=${{marginTop:10}}>
      <button class="btn btn-gold btn-sm" onClick=${()=>props.onNewTx({categorie:CAT_PRESTA,type:'sortie',clientId:a.clientId,prestaId:a.prestaId,libelle:'Acompte '+pr.nom+(cl?' — '+cl.nom:'')})}><${Icon} name="Plus" size=${13} /> Verser un acompte</button>
      <span style=${{marginLeft:'auto'}} class="flex items-center gap-1">
        <button class="icon-btn" onClick=${()=>props.onEditAssign(a)} aria-label="Modifier l'affectation"><${Icon} name="Pencil" size=${15} /></button>
        <${DelBtn} onDelete=${()=>api.delAssign(a.id)} label="Supprimer l'affectation" />
      </span>
    </div>
    ${txs.length>0&&html`<div style=${{marginTop:8,borderTop:'1px solid var(--line)',paddingTop:6}}>
      <p class="eyebrow" style=${{marginBottom:2}}>Versements enregistrés</p>
      ${txs.map(t=>html`<div key=${t.id} class="flex flex-wrap items-center justify-between gap-2" style=${{padding:'4px 0',fontSize:13}}>
        <span style=${{minWidth:0,overflowWrap:'anywhere'}}>${fdate(t.date)} · ${t.mode} · ${t.libelle}</span>
        <span class="flex items-center gap-1"><b class="num">${props.cxfm(t.sortie)}</b>
          <button class="icon-btn" style=${{width:28,height:28}} onClick=${()=>props.onEditTx(t)} aria-label="Modifier le versement"><${Icon} name="Pencil" size=${13} /></button>
          <${DelBtn} onDelete=${()=>api.delTx(t.id)} label="Supprimer le versement" size=${13} /></span>
      </div>`)}
    </div>`}
  </div>`;
}
function Prestataires(props){
  const {data,S,api,sub,setSub}=props;
  const cx=useCx();
  const [cat,setCat]=useState('Toutes');
  const [q,setQ]=useState('');
  const [edit,setEdit]=useState(null);
  const [asg,setAsg]=useState(null);
  const [open,setOpen]=useState('');
  const [zero,setZero]=useState(false);
  const list=data.prestataires.filter(p=>(cat==='Toutes'||p.cat===cat)&&(!q.trim()||(p.nom+' '+p.ville+' '+p.tel+' '+p.cat).toLowerCase().indexOf(q.trim().toLowerCase())>=0))
    .sort((a,b)=>b.note-a.note||(a.nom<b.nom?-1:1));
  const counts={};PCATS.forEach(c=>{counts[c]=data.prestataires.filter(p=>p.cat===c).length;});
  const groups=data.clients.filter(c=>S.assignRows.some(a=>a.clientId===c.id)).sort((a,b)=>(a.date||'9')<(b.date||'9')?-1:1);
  const totConv=S.assignRows.reduce((s,a)=>s+(Number(a.convenu)||0),0);
  const totPaye=S.assignRows.reduce((s,a)=>s+a.paye,0);
  return html`<div>
    <${PageHead} eyebrow="Annuaire local" title="Prestataires" sub=${data.prestataires.length+' prestataire'+(data.prestataires.length>1?'s':'')+' · fiches, tarifs, fiabilité et suivi des acomptes par événement'}>
      <button class="btn btn-primary" onClick=${()=>setEdit({})}><${Icon} name="Plus" size=${16} /> Nouveau prestataire</button>
    <//>
    <div class="tabs" role="tablist" style=${{marginBottom:14}}>
      <button role="tab" class=${sub==='annuaire'?'on':''} onClick=${()=>setSub('annuaire')}><${Icon} name="Users" size=${15} /> Annuaire</button>
      <button role="tab" class=${sub==='suivi'?'on':''} onClick=${()=>setSub('suivi')}><${Icon} name="Wallet" size=${15} /> Suivi des paiements</button>
    </div>

    ${sub==='annuaire'?html`<div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-primary btn-sm" onClick=${()=>setEdit({})}><${Icon} name="Plus" size=${14} /> Ajouter un prestataire</button>
        ${data.prestataires.length>0&&!zero&&html`<button class="btn btn-ghost btn-sm" onClick=${()=>setZero(true)}><${Icon} name="Trash2" size=${14} /> Mettre l'annuaire à zéro</button>`}
        ${zero&&html`<span class="flex flex-wrap items-center gap-2">
          <span style=${{fontWeight:700,fontSize:13}}>Supprimer les ${data.prestataires.length} prestataire${data.prestataires.length>1?'s':''}, leurs fichiers et leurs affectations ? Clients, caisse, ventes, projets et devis ne changent pas.</span>
          <button class="btn btn-danger btn-sm" onClick=${()=>{api.clearPrestataires();setZero(false);setOpen('');}}>Tout supprimer</button>
          <button class="btn btn-ghost btn-sm" onClick=${()=>setZero(false)}>Annuler</button>
        </span>`}
      </div>
      <div style=${{position:'relative'}}>
        <span style=${{position:'absolute',left:12,top:11,color:'var(--muted)'}}><${Icon} name="Search" size=${16} /></span>
        <input class="input" style=${{paddingLeft:36}} placeholder="Rechercher un nom, une ville, un numéro…" value=${q} onChange=${e=>setQ(e.target.value)} aria-label="Rechercher un prestataire" />
      </div>
      <div class="chips">
        <button class=${'chip'+(cat==='Toutes'?' on':'')} onClick=${()=>setCat('Toutes')}>Toutes<small>${data.prestataires.length}</small></button>
        ${PCATS.map(c=>html`<button key=${c} class=${'chip'+(cat===c?' on':'')} onClick=${()=>setCat(c)}>${c}<small>${counts[c]}</small></button>`)}
      </div>
      ${list.length===0?html`<${Empty} icon="Truck" title=${data.prestataires.length?'Aucun résultat':'Aucun prestataire'} text=${data.prestataires.length?'Essayez une autre catégorie ou un autre nom.':'Ajoutez votre premier partenaire local.'} />`:html`<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        ${list.map(p=>{
          const rows=S.assignRows.filter(a=>a.prestaId===p.id);
          const sec=open.indexOf(p.id+'|')===0?open.split('|')[1]:'';const nFiles=(p.files||[]).length;const nNotes=(p.notesLog||[]).length;
          return html`<article key=${p.id} class="card flex flex-col gap-3" style=${{padding:16}}>
            <div class="flex items-start justify-between gap-2">
              <div style=${{minWidth:0}}><h3 style=${{overflowWrap:'anywhere'}}>${p.nom}</h3>
                <p class="muted flex flex-wrap items-center gap-x-3" style=${{fontSize:12.5,marginTop:2}}><span class="flex items-center gap-1"><${Icon} name=${PCAT_ICON[p.cat]||'Package'} size=${13} />${p.cat}</span><span class="flex items-center gap-1"><${Icon} name="MapPin" size=${13} />${p.ville||'—'}</span></p></div>
              <span class="flex gap-1">
                <button class="icon-btn" onClick=${()=>setEdit(p)} aria-label=${'Modifier '+p.nom}><${Icon} name="Pencil" size=${15} /></button>
                <${DelBtn} onDelete=${()=>api.delPresta(p.id)} label=${'Supprimer '+p.nom} />
              </span>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-2" style=${{fontSize:13}}>
              <p class="muted">Téléphone</p><p class="num" style=${{fontWeight:600}}>${p.tel||'—'}</p>
              <p class="muted">Tarif indicatif</p><${Amt} style=${{fontWeight:700}} v=${Number(p.tarif)||0} />
              <p class="muted">Fiabilité</p><${Stars} value=${p.note} onChange=${n=>api.savePresta(Object.assign({},p,{note:n}),true)} />
            </div>
            ${p.notes&&html`<p class="muted" style=${{fontSize:12.5,overflowWrap:'anywhere'}}>${p.notes}</p>`}
            <hr class="divider" />
            <div class="flex flex-wrap items-center gap-2">
              ${p.tel&&html`<a class="btn btn-wa btn-sm" href=${waLink(p.tel,p.nom,"Bonjour "+p.nom+", ici Axelog Consulting Event's. Êtes-vous disponible pour une prestation ?")} target="_blank" rel="noopener noreferrer"><${Icon} name="MessageCircle" size=${14} /> WhatsApp</a>`}
              <button class="btn btn-ghost btn-sm" onClick=${()=>setAsg({prestaId:p.id})}><${Icon} name="Link" size=${14} /> Affecter</button>
              <span class="flex flex-wrap items-center gap-1" style=${{marginLeft:'auto'}}>
                <button class="btn btn-ghost btn-sm" onClick=${()=>setOpen(sec==='files'?'':p.id+'|files')} aria-expanded=${sec==='files'}><${Icon} name="Paperclip" size=${13} /> Fichiers (${nFiles})</button>
                <button class="btn btn-ghost btn-sm" onClick=${()=>setOpen(sec==='notes'?'':p.id+'|notes')} aria-expanded=${sec==='notes'}><${Icon} name="FileText" size=${13} /> Notes (${nNotes})</button>
                <button class="btn btn-ghost btn-sm" onClick=${()=>setOpen(sec==='events'?'':p.id+'|events')} aria-expanded=${sec==='events'}>${rows.length} événement${rows.length>1?'s':''} <${Icon} name=${sec==='events'?'ChevronUp':'ChevronDown'} size=${13} /></button>
              </span>
            </div>
            ${sec==='files'&&html`<${PrestaFiles} p=${p} api=${api} notify=${props.notify} />`}
            ${sec==='notes'&&html`<${NotesLog} bare=${true} items=${p.notesLog} placeholder="Ajouter une note sur ce prestataire…" onChange=${l=>api.savePresta(Object.assign({},p,{notesLog:l}),true)} />`}
            ${sec==='events'&&html`<div class="flex flex-col gap-2">
              ${rows.length===0&&html`<p class="muted" style=${{fontSize:12.5}}>Pas encore affecté à un événement.</p>`}
              ${rows.map(a=>html`<${AssignBlock} key=${a.id} a=${a} S=${S} data=${data} api=${api} who="presta" cxfm=${cx.fm} onNewTx=${props.onNewTx} onEditTx=${props.onEditTx} onEditAssign=${a=>setAsg({assign:a})} />`)}
            </div>`}
          </article>`;
        })}
      </div>`}
    </div>`:html`<div class="flex flex-col gap-3">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="card pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Montants convenus</p><${Amt} className="font-display" style=${{fontSize:19,fontWeight:700,marginTop:4}} v=${totConv} /></div>
        <div class="card pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Acomptes versés</p><${Amt} className="font-display pos" style=${{fontSize:19,fontWeight:700,marginTop:4}} v=${totPaye} /></div>
        <div class="card kpi-hero pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Solde restant dû</p><${Amt} className="font-display" style=${{fontSize:19,fontWeight:700,marginTop:4}} v=${S.duePresta} /></div>
      </div>
      <div class="flex flex-wrap gap-2"><button class="btn btn-primary" onClick=${()=>setAsg({})}><${Icon} name="Link" size=${16} /> Affecter un prestataire</button></div>
      ${groups.length===0?html`<${Empty} icon="Wallet" title="Aucun suivi pour le moment" text="Affectez un prestataire à un événement pour suivre les acomptes et le solde dû." />`:groups.map(c=>{
        const rows=S.assignRows.filter(a=>a.clientId===c.id);
        const conv=rows.reduce((s,a)=>s+(Number(a.convenu)||0),0),paye=rows.reduce((s,a)=>s+a.paye,0);
        return html`<section key=${c.id} class="card pad" style=${{padding:16}}>
          <div class="flex flex-wrap items-start justify-between gap-3" style=${{marginBottom:10}}>
            <div style=${{minWidth:0}}><h3 style=${{overflowWrap:'anywhere'}}>${c.nom}</h3><p class="muted" style=${{fontSize:12.5}}>${c.typeEvt||'Événement'} · ${fdate(c.date)}</p></div>
            <div class="flex flex-wrap gap-4" style=${{fontSize:13}}>
              <div><p class="muted" style=${{fontSize:11.5}}>Convenu</p><${Amt} style=${{fontWeight:700}} v=${conv} /></div>
              <div><p class="muted" style=${{fontSize:11.5}}>Versé</p><${Amt} className="pos" style=${{fontWeight:700}} v=${paye} /></div>
              <div><p class="muted" style=${{fontSize:11.5}}>Reste dû</p><${Amt} style=${{fontWeight:800}} v=${Math.max(0,conv-paye)} /></div>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            ${rows.map(a=>html`<${AssignBlock} key=${a.id} a=${a} S=${S} data=${data} api=${api} who="client" cxfm=${cx.fm} onNewTx=${props.onNewTx} onEditTx=${props.onEditTx} onEditAssign=${a=>setAsg({assign:a})} />`)}
          </div>
        </section>`;
      })}
    </div>`}
    ${edit&&html`<${PrestaForm} presta=${edit.id?edit:null} cat=${cat==='Toutes'?'':cat} onSave=${p=>api.savePresta(p)} onClose=${()=>setEdit(null)} />`}
    ${asg&&html`<${AssignModal} assign=${asg.assign||null} prestaId=${asg.prestaId} clientId=${asg.clientId} clients=${data.clients} prestas=${data.prestataires} onSave=${api.saveAssign} onClose=${()=>setAsg(null)} />`}
  </div>`;
}

/* ---------- documents imprimables (devis, factures, récapitulatifs) ---------- */
const DOC_CSS=".doc{background:#fff;color:#1d1633;max-width:820px;margin:0 auto;padding:34px;font-family:'Manrope',system-ui,sans-serif;font-size:13px;line-height:1.5;text-align:left}"
+".doc h1{font-family:'Bricolage Grotesque','Manrope',sans-serif;font-size:22px;margin:0;letter-spacing:.04em;color:#4A1D7C}"
+".doc h2{font-family:'Manrope',sans-serif;font-size:12.5px;text-transform:uppercase;letter-spacing:.08em;color:#4A1D7C;margin:20px 0 6px}"
+".doc p{margin:0}.doc .head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #C9A227;padding-bottom:14px;flex-wrap:wrap}"
+".doc .brand{font-size:18px;font-weight:800;color:#14213D}.doc .sub{color:#6C6683;font-size:12px}"
+".doc table{width:100%;border-collapse:collapse;margin-top:4px}"
+".doc th{background:#F1EAFB;color:#35135A;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:7px 8px}"
+".doc td{padding:7px 8px;border-bottom:1px solid #E7E2F0;vertical-align:top}"
+".doc .r{text-align:right}.doc .eq{color:#6C6683;font-size:11px;font-weight:600}"
+".doc tr.tot td{font-weight:800;background:#FAF3D6}"
+".doc .grid2{display:flex;gap:20px;flex-wrap:wrap}.doc .grid2>div{flex:1 1 240px}"
+".doc .box{background:#14213D;color:#fff;border-radius:10px;padding:14px 16px;margin-top:14px;display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between}"
+".doc .box b{display:block;font-size:19px}.doc .box span{font-size:11px;color:#C9D0E3;text-transform:uppercase;letter-spacing:.06em}"
+".doc .note{font-size:11.5px;color:#6C6683;margin-top:8px}"
+".doc .sign{display:flex;gap:30px;margin-top:34px}.doc .sign div{flex:1;border-top:1px solid #1d1633;padding-top:6px;font-size:12px;color:#6C6683}"
+".doc .pos{color:#17795A}.doc .neg{color:#B4233F}.doc .tag{display:inline-block;background:#E3F4EC;color:#17795A;border-radius:99px;padding:0 7px;font-size:10.5px;font-weight:700}"
+".doc .logo{max-height:70px;max-width:190px;display:block;margin-bottom:8px;object-fit:contain}"
+".doc .party{border:1px solid #E7E2F0;border-radius:10px;padding:10px 12px}.doc .party h2{margin-top:0}"
+".doc .kv{display:flex;gap:8px;font-size:12.5px;padding:1px 0}.doc .kv b{min-width:112px;color:#6C6683;font-weight:600;flex-shrink:0}.doc .kv span{overflow-wrap:anywhere}"
+".doc .det{color:#6C6683;font-size:11.5px;margin-top:2px}.doc .num{white-space:nowrap}"
+".doc .sig2{display:flex;gap:30px;margin-top:30px}.doc .sig2>div{flex:1}.doc .sig2 .box2{height:86px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #1d1633}"
+".doc .sig2 p{font-size:12px;color:#6C6683;margin-top:6px}.doc .sigimg{max-height:78px;max-width:210px;display:block;object-fit:contain}";
function docHead(title,numero,lines){
  return '<div class="head"><div><p class="brand">AXELOG CONSULTING EVENT’S</p><p class="sub">Organisation d’événements et logistique événementielle</p><p class="sub">Pointe-Noire / Brazzaville · République du Congo</p></div>'
   +'<div style="text-align:right"><h1>'+esc(title)+'</h1>'+(numero?'<p style="font-weight:800">'+esc(numero)+'</p>':'')+lines.map(l=>'<p class="sub">'+esc(l)+'</p>').join('')+'</div></div>';
}
function totalBox(v,cx){
  const order=[cx.cur].concat(cx.others);
  const lab={XAF:'FCFA',EUR:'Euros',USD:'Dollars US'};
  return '<div class="box">'+order.map(c=>'<div><span>'+lab[c]+'</span><b>'+esc(cx.fx(v,c))+'</b></div>').join('')+'</div>'
   +'<p class="note">Conversions indicatives : 1 € = '+esc(nf2.format(cx.rates.eur))+' FCFA · 1 $ = '+esc(nf2.format(cx.rates.usd))+' FCFA. La comptabilité locale est tenue en FCFA.</p>';
}
function docProfileOf(data){
  return Object.assign({societe:"Axelog Consulting Event's",nom:'Jessica',contact:'',ville:'Pointe-Noire',email:'',logo:'',signature:''},data.docProfile||{});
}
function ciOf(d,client){
  return Object.assign({nom:client?client.nom:'',contact:client?(client.tel||''):'',ville:client?(client.ville||''):'',email:''},d.clientInfo||{});
}
const okImg=u=>typeof u==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,/.test(u);
function partyHtml(title,o){
  const kv=(k,v)=>'<div class="kv"><b>'+k+'</b><span>'+(v?esc(v):'—')+'</span></div>';
  return '<div class="party"><h2>'+title+'</h2>'+(o.societe?'<p style="font-weight:800;margin-bottom:4px">'+esc(o.societe)+'</p>':'')
    +kv('Nom et prénoms',o.nom)+kv('Contact',o.contact)+kv('Ville',o.ville)+kv('Adresse e-mail',o.email)+'</div>';
}
function devisDocBody(d,client,cx,profile){
  const pf=profile||{};
  const ci=ciOf(d,client);
  const t=devisTotals(d);
  const m=v=>esc(cx.fm(v));
  const eq=v=>'<div class="eq">≈ '+esc(cx.others.map(c=>cx.fx(v,c)).join(' · '))+'</div>';
  const isF=d.type==='Facture';
  const frais=(d.frais||[]).filter(f=>f.on);
  const showLogo=d.showLogo!==false&&okImg(pf.logo);
  const showSig=d.showSignature!==false&&okImg(pf.signature);
  const societe=pf.societe||'AXELOG CONSULTING EVENT’S';
  const lines=['Date : '+fdate(d.date),(!isF&&d.validite)?'Valable jusqu’au '+fdate(d.validite):'','Statut : '+d.statut].filter(Boolean);
  let h='<div class="head"><div>'+(showLogo?'<img class="logo" src="'+pf.logo+'" alt="Logo">':'')+'<p class="brand">'+esc(societe)+'</p><p class="sub">Organisation d’événements et logistique événementielle</p><p class="sub">Pointe-Noire / Brazzaville · République du Congo</p></div>'
    +'<div style="text-align:right"><h1>'+(isF?'FACTURE PRO-FORMA':'DEVIS PRO-FORMA')+'</h1><p style="font-weight:800">'+esc(d.numero)+'</p>'+lines.map(l=>'<p class="sub">'+esc(l)+'</p>').join('')+'</div></div>';
  h+='<div class="grid2" style="margin-top:14px">'+partyHtml('Émetteur',{societe:societe,nom:pf.nom,contact:pf.contact,ville:pf.ville,email:pf.email})+partyHtml('Client',ci)+'</div>';
  h+='<div class="party" style="margin-top:12px"><h2>Événement</h2><div class="kv"><b>Objet</b><span>'+esc(d.objet||(client?client.typeEvt:'')||'—')+'</span></div>'
    +'<div class="kv"><b>Date prévue</b><span>'+esc(client&&client.date?fdate(client.date):'—')+'</span></div></div>';
  if(frais.length){
    h+='<h2>Frais fixes non remboursables (avant démarrage)</h2><table><thead><tr><th>Désignation</th><th class="r">Montant</th></tr></thead><tbody>'
      +frais.map(f=>'<tr><td>'+esc(f.libelle)+'</td><td class="r">'+m(pnum(f.montant))+eq(pnum(f.montant))+'</td></tr>').join('')
      +'<tr class="tot"><td>Sous-total frais fixes</td><td class="r">'+m(t.frais)+'</td></tr></tbody></table>';
  }
  h+='<h2>Détail des achats et prestations</h2><table><thead><tr><th style="width:28px">N°</th><th>Désignation complète</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Total de la ligne</th></tr></thead><tbody>'
    +((d.lignes||[]).length?d.lignes.map((l,n)=>'<tr><td>'+(n+1)+'</td><td><b>'+esc(l.libelle)+'</b>'+(l.detail?'<div class="det">'+esc(l.detail)+'</div>':'')+'</td><td class="r num">'+esc(l.qte)+(l.unite?' '+esc(l.unite):'')+'</td><td class="r num">'+m(pnum(l.pu))+'</td><td class="r num">'+m(pnum(l.qte)*pnum(l.pu))+'</td></tr>').join(''):'<tr><td colspan="5" class="sub">Aucune ligne</td></tr>')
    +'<tr class="tot"><td colspan="4">Sous-total prestations</td><td class="r">'+m(t.prest)+'</td></tr>'
    +(pnum(d.margePct)>0?'<tr><td colspan="4">Honoraires d’organisation et de coordination ('+esc(pnum(d.margePct))+' %)</td><td class="r">'+m(t.marge)+'</td></tr>':'')
    +'</tbody></table>';
  h+=totalBox(t.total,cx);
  if((d.echeances||[]).length){
    h+='<h2>Échéancier de paiement</h2><table><thead><tr><th>Échéance</th><th>Date limite</th><th class="r">Montant</th></tr></thead><tbody>'
      +d.echeances.map(e=>'<tr><td>'+esc(e.libelle)+(e.paye?' <span class="tag">Payé</span>':'')+'</td><td>'+esc(e.date?fdate(e.date):'À définir')+'</td><td class="r">'+m(pnum(e.montant))+eq(pnum(e.montant))+'</td></tr>').join('')
      +'<tr class="tot"><td colspan="2">Total planifié</td><td class="r">'+m(t.planned)+'</td></tr></tbody></table>';
  }
  h+='<h2>Conditions</h2><p class="note" style="margin-top:0">Les frais fixes (repérage d’espaces, recherche de prestataires) sont dus avant tout démarrage et ne sont pas remboursables. Le solde est réglé avant la date de l’événement. Un contrat écrit encadre la prestation. Paiements acceptés : MTN MoMo, Airtel Money, espèces, virement bancaire.</p>'
    +(d.notes?'<p class="note">'+esc(d.notes)+'</p>':'');
  h+='<div class="sig2"><div><div class="box2"></div><p>Bon pour accord — le client<br />'+esc(ci.nom||'')+' (date et signature)</p></div>'
    +'<div><div class="box2">'+(showSig?'<img class="sigimg" src="'+pf.signature+'" alt="Signature">':'')+'</div><p>Pour '+esc(societe)+'<br />'+esc(pf.nom||'')+'</p></div></div>';
  return '<div class="doc">'+h+'</div>';
}
function recapDocBody(client,data,S,cx){
  const m=v=>esc(cx.fm(v));
  const eq=v=>'<div class="eq">≈ '+esc(cx.others.map(c=>cx.fx(v,c)).join(' · '))+'</div>';
  const ins=data.transactions.filter(t=>t.clientId===client.id&&t.entree>0).sort((a,b)=>a.date<b.date?-1:1);
  const outs=data.transactions.filter(t=>t.clientId===client.id&&t.sortie>0).sort((a,b)=>a.date<b.date?-1:1);
  const enc=S.enc[client.id]||0,dec=S.dec[client.id]||0,marge=enc-dec,budget=Number(client.budget)||0;
  const ds=data.devis.filter(d=>d.clientId===client.id);
  const rows=S.assignRows.filter(a=>a.clientId===client.id);
  let h=docHead('RÉCAPITULATIF FINANCIER','',['Édité le '+fdate(todayISO())]);
  h+='<div class="grid2" style="margin-top:14px"><div><h2>Client</h2><p style="font-weight:800">'+esc(client.nom)+'</p><p class="sub">'+esc(client.tel||'')+' '+esc(client.ville||'')+'</p></div>'
    +'<div><h2>Événement</h2><p style="font-weight:800">'+esc(client.typeEvt||'—')+'</p><p class="sub">Date prévue : '+esc(fdate(client.date))+' · '+esc(client.statut)+'</p></div></div>';
  h+='<h2>Synthèse</h2><table><tbody>'
    +'<tr><td>Budget estimé</td><td class="r">'+m(budget)+eq(budget)+'</td></tr>'
    +'<tr><td>Encaissements clients enregistrés</td><td class="r pos">'+m(enc)+eq(enc)+'</td></tr>'
    +'<tr><td>Reste à encaisser sur le budget</td><td class="r">'+m(Math.max(0,budget-enc))+eq(Math.max(0,budget-enc))+'</td></tr>'
    +'<tr><td>Décaissements enregistrés (prestataires et frais du dossier)</td><td class="r neg">'+m(dec)+eq(dec)+'</td></tr>'
    +'<tr class="tot"><td>Marge nette réelle</td><td class="r '+(marge<0?'neg':'')+'">'+m(marge)+eq(marge)+'</td></tr></tbody></table>';
  h+=totalBox(marge,cx);
  if(ds.length)h+='<h2>Devis et factures</h2><table><thead><tr><th>Numéro</th><th>Statut</th><th class="r">Total</th></tr></thead><tbody>'+ds.map(d=>{const v=devisTotals(d).total;return '<tr><td>'+esc(d.numero)+' ('+esc(d.type)+')</td><td>'+esc(d.statut)+'</td><td class="r">'+m(v)+eq(v)+'</td></tr>';}).join('')+'</tbody></table>';
  h+='<h2>Encaissements clients</h2><table><thead><tr><th>Date</th><th>Libellé</th><th>Mode</th><th class="r">Montant</th></tr></thead><tbody>'
    +(ins.length?ins.map(t=>'<tr><td>'+esc(fdate(t.date))+'</td><td>'+esc(t.libelle)+'</td><td>'+esc(t.mode)+'</td><td class="r">'+m(t.entree)+'</td></tr>').join(''):'<tr><td colspan="4" class="sub">Aucun encaissement</td></tr>')+'</tbody></table>';
  h+='<h2>Décaissements</h2><table><thead><tr><th>Date</th><th>Libellé</th><th>Mode</th><th class="r">Montant</th></tr></thead><tbody>'
    +(outs.length?outs.map(t=>'<tr><td>'+esc(fdate(t.date))+'</td><td>'+esc(t.libelle)+'</td><td>'+esc(t.mode)+'</td><td class="r">'+m(t.sortie)+'</td></tr>').join(''):'<tr><td colspan="4" class="sub">Aucun décaissement</td></tr>')+'</tbody></table>';
  if(rows.length)h+='<h2>Prestataires : convenu, versé, reste dû</h2><table><thead><tr><th>Prestataire</th><th class="r">Convenu</th><th class="r">Versé</th><th class="r">Reste dû</th></tr></thead><tbody>'
    +rows.map(a=>'<tr><td>'+esc(S.pr[a.prestaId].nom)+'<div class="eq">'+esc(a.prestation)+'</div></td><td class="r">'+m(Number(a.convenu)||0)+'</td><td class="r">'+m(a.paye)+'</td><td class="r">'+m(a.reste)+'</td></tr>').join('')+'</tbody></table>';
  return '<div class="doc">'+h+'</div>';
}
function standaloneHtml(title,body){
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title>'
   +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Manrope:wght@400;600;700;800&display=swap">'
   +'<style>body{margin:0;background:#EEEAF5;padding:20px}.bar{max-width:820px;margin:0 auto 14px;display:flex;gap:10px;align-items:center;font-family:Manrope,system-ui,sans-serif;font-size:13px;color:#35135A}'
   +'.bar button{background:#4A1D7C;color:#fff;border:0;border-radius:9px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:13px}'
   +DOC_CSS+'@media print{.noprint{display:none!important}body{background:#fff;padding:0}.doc{padding:0;max-width:none}@page{margin:14mm}}</style></head><body>'
   +'<div class="bar noprint"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button><span>Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ».</span></div>'
   +body+'</body></html>';
}
function useDownloads(){
  return DOWNLOADER;
}
function slug(s){return String(s||'document').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'document';}
function DocPreview(props){
  const dl=useDownloads();
  const full=useMemo(()=>standaloneHtml(props.title,props.body),[props.title,props.body]);
  const download=async()=>{
    if(!dl)return;
    try{await dl.save({filename:props.filename+'.html',data:full});props.notify('Document prêt : ouvrez-le puis imprimez ou enregistrez en PDF');}
    catch(e){if(e&&e.code==='declined')return;props.notify('Téléchargement indisponible ici : utilisez « Copier le code HTML »');}
  };
  const copy=async()=>{
    try{await navigator.clipboard.writeText(full);props.notify('Code HTML copié : collez-le dans un fichier .html');}
    catch(e){props.notify('Copie refusée par le navigateur');}
  };
  return html`<div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      ${dl&&html`<button class="btn btn-primary" onClick=${download}><${Icon} name="Printer" size=${16} /> Télécharger pour imprimer / PDF</button>`}
      <button class=${'btn '+(dl?'btn-ghost':'btn-primary')} onClick=${copy}><${Icon} name="Copy" size=${16} /> Copier le code HTML</button>
    </div>
    <p class="muted" style=${{fontSize:12.5}}>L'impression directe est bloquée dans cet affichage. Le fichier téléchargé s'ouvre dans votre navigateur avec un bouton « Imprimer / Enregistrer en PDF ». Les montants suivent la devise d'affichage choisie, avec les conversions en regard.</p>
    <div class="docwrap"><div dangerouslySetInnerHTML=${{__html:'<style>'+DOC_CSS+'</style>'+props.body}}></div></div>
  </div>`;
}
function RecapModal(props){
  const {data,S,client}=props;
  const cx=useCx();
  const body=useMemo(()=>recapDocBody(client,data,S,cx),[client,data,S,cx]);
  return html`<${Modal} title=${'Récapitulatif — '+client.nom} onClose=${props.onClose} wide=${true}>
    <${DocPreview} title=${'Récapitulatif financier — '+client.nom} filename=${'recapitulatif-'+slug(client.nom)} body=${body} notify=${props.notify} />
  <//>`;
}

/* ---------- Devis & Facturation ---------- */
function NewDevisModal(props){
  const [clientId,setClientId]=useState(props.clientId||(props.clients[0]?props.clients[0].id:''));
  const [type,setType]=useState('Devis');
  const submit=e=>{e.preventDefault();props.onCreate(clientId,type);props.onClose();};
  return html`<${Modal} title="Nouveau document" onClose=${props.onClose}>
    <form onSubmit=${submit} class="flex flex-col gap-3">
      <div class="segbtn">
        <button type="button" class=${type==='Devis'?'on':''} onClick=${()=>setType('Devis')}><${Icon} name="FileText" size=${16} /> Devis pro-forma</button>
        <button type="button" class=${type==='Facture'?'on':''} onClick=${()=>setType('Facture')}><${Icon} name="Receipt" size=${16} /> Facture pro-forma</button>
      </div>
      <${Field} id="nd-client" label="Client"><select id="nd-client" class="input" value=${clientId} onChange=${e=>setClientId(e.target.value)}>
        <option value="">— À choisir plus tard —</option>${props.clients.map(c=>html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select><//>
      <p class="muted" style=${{fontSize:12.5}}>Les frais fixes non remboursables par défaut (repérage d'espaces, recherche de prestataires) sont ajoutés automatiquement et restent modifiables dans le document.</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary"><${Icon} name="Check" size=${16} /> Créer</button>
      </div>
    </form>
  <//>`;
}
function MargePanel(props){
  const {data,S}=props;
  const cx=useCx();
  const rows=data.clients.filter(c=>(S.enc[c.id]||0)>0||(S.dec[c.id]||0)>0||data.devis.some(d=>d.clientId===c.id))
    .sort((a,b)=>(a.date||'9')<(b.date||'9')?-1:1);
  return html`<section class="card pad" style=${{padding:16}}>
    <div class="flex flex-wrap items-end justify-between gap-2" style=${{marginBottom:10}}>
      <div><h2>Marge nette réelle par événement</h2><p class="muted" style=${{fontSize:12.5}}>Encaissements clients enregistrés moins décaissements du dossier (prestataires et frais rattachés).</p></div>
      <div style=${{textAlign:'right'}}><p class="eyebrow">Marge totale</p><${Amt} className=${'font-display r '+(S.margeTotal<0?'neg':'pos')} style=${{fontSize:19,fontWeight:700}} v=${S.margeTotal} /></div>
    </div>
    ${rows.length===0?html`<p class="muted">Aucune donnée pour le moment.</p>`:html`<div class="scroll-x"><table class="tbl">
      <thead><tr><th>Événement</th><th class="r">Budget</th><th class="r">Encaissé</th><th class="r">Décaissé</th><th class="r">Marge nette</th><th class="r">Taux</th><th></th></tr></thead>
      <tbody>${rows.map(c=>{
        const enc=S.enc[c.id]||0,dec=S.dec[c.id]||0,mg=enc-dec;
        return html`<tr key=${c.id}>
          <td style=${{minWidth:200}}><b>${c.nom}</b><div class="muted" style=${{fontSize:12}}>${c.typeEvt||'—'} · ${fdate(c.date)}</div></td>
          <td class="r"><${Amt} v=${Number(c.budget)||0} /></td>
          <td class="r"><${Amt} className="pos" v=${enc} /></td>
          <td class="r"><${Amt} className="neg" v=${dec} /></td>
          <td class="r"><${Amt} className=${mg<0?'neg':'pos'} style=${{fontWeight:800}} v=${mg} /></td>
          <td class="r num">${enc?Math.round(mg/enc*100)+' %':'—'}</td>
          <td class="r" style=${{whiteSpace:'nowrap'}}><button class="btn btn-ghost btn-sm" onClick=${()=>props.openRecap(c.id)}><${Icon} name="FileText" size=${13} /> Récap.</button></td>
        </tr>`;})}</tbody>
    </table></div>`}
  </section>`;
}
async function imageToDataUrl(file,max){
  let url='';
  try{
    url=URL.createObjectURL(file);
    const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('img'));im.src=url;});
    const draw=(mx,type,q)=>{
      const sc=Math.min(1,mx/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.max(1,Math.round(img.naturalWidth*sc)),h=Math.max(1,Math.round(img.naturalHeight*sc));
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      const ctx=cv.getContext('2d');
      if(type==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);}
      ctx.drawImage(img,0,0,w,h);
      return cv.toDataURL(type,q);
    };
    let out=file.type==='image/png'?draw(max,'image/png'):draw(max,'image/jpeg',0.85);
    if(out.length>350000)out=draw(Math.round(max*0.7),'image/jpeg',0.78);
    return out;
  }finally{if(url)URL.revokeObjectURL(url);}
}
function ImageSlot(props){
  const inp=useRef(null);
  const [busy,setBusy]=useState(false);
  const [over,setOver]=useState(false);
  const pick=async f=>{
    if(!f)return;
    if(!/^image\/(png|jpeg|webp)$/.test(f.type)){props.notify('Format non pris en charge : utilisez PNG, JPG ou WebP');return;}
    if(f.size>8*1024*1024){props.notify('Image trop volumineuse (8 Mo maximum)');return;}
    setBusy(true);
    try{const u=await imageToDataUrl(f,props.max);props.onChange(u);props.notify(props.label+(props.value?' remplacé':' ajouté'));}
    catch(e){props.notify('Impossible de lire cette image');}
    setBusy(false);
  };
  return html`<div class="flex flex-col gap-2">
    <p class="label" style=${{margin:0}}>${props.label}</p>
    <div class=${'slot'+(over?' over':'')} role="button" tabIndex="0" aria-label=${'Importer : '+props.label} onClick=${()=>inp.current&&inp.current.click()}
      onKeyDown=${e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inp.current&&inp.current.click();}}}
      onDragOver=${e=>{e.preventDefault();setOver(true);}} onDragLeave=${()=>setOver(false)} onDrop=${e=>{e.preventDefault();setOver(false);pick((e.dataTransfer.files||[])[0]);}}>
      ${okImg(props.value)?html`<img class="slotimg" src=${props.value} alt=${props.label} />`:html`<span class="muted" style=${{fontSize:12.5}}>${busy?'Traitement…':'Cliquez ou glissez une image ici (PNG, JPG, WebP)'}</span>`}
    </div>
    <input ref=${inp} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label=${'Choisir : '+props.label} onChange=${e=>{const f=(e.target.files||[])[0];e.target.value='';pick(f);}} />
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="btn btn-ghost btn-sm" disabled=${busy} onClick=${()=>inp.current&&inp.current.click()}><${Icon} name="Upload" size=${13} /> ${okImg(props.value)?'Remplacer':'Ajouter'}</button>
      ${okImg(props.value)&&html`<${ConfirmBtn} label="Supprimer" icon="Trash2" onConfirm=${()=>{props.onChange('');props.notify(props.label+' supprimé');}} />`}
      <label class="flex items-center gap-1" style=${{fontSize:12.5,fontWeight:600,cursor:'pointer',marginLeft:'auto'}}><input type="checkbox" class="check" style=${{marginTop:0}} checked=${props.shown} onChange=${e=>props.onShown(e.target.checked)} /> Afficher sur ce document</label>
    </div>
  </div>`;
}
function PartyFields(props){
  const v=props.values;
  const set=k=>e=>props.onChange(k,e.target.value);
  const p=props.pid;
  return html`<div class="card" style=${{padding:14,background:'#FAF8FD'}}>
    <h3 style=${{marginBottom:8}}>${props.title}</h3>
    <div class="grid gap-2 sm:grid-cols-2">
      ${props.withSociete&&html`<${Field} id=${p+'-soc'} label="Raison sociale" cls="sm:col-span-2"><input id=${p+'-soc'} class="input" value=${v.societe||''} onChange=${set('societe')} /><//>`}
      <${Field} id=${p+'-nom'} label="Nom et prénoms" cls="sm:col-span-2"><input id=${p+'-nom'} class="input" value=${v.nom||''} onChange=${set('nom')} /><//>
      <${Field} id=${p+'-contact'} label="Contact (téléphone / WhatsApp)"><input id=${p+'-contact'} class="input" type="tel" inputMode="tel" value=${v.contact||''} onChange=${set('contact')} /><//>
      <${Field} id=${p+'-ville'} label="Ville"><input id=${p+'-ville'} class="input" list="villes-doc" value=${v.ville||''} onChange=${set('ville')} /><//>
      <${Field} id=${p+'-mail'} label="Adresse e-mail" cls="sm:col-span-2"><input id=${p+'-mail'} class="input" type="email" inputMode="email" value=${v.email||''} onChange=${set('email')} placeholder="nom@exemple.com" /><//>
    </div>
    ${props.children}
  </div>`;
}
function DevisEditor(props){
  const {data,S,api,d}=props;
  const cx=useCx();
  const [tab,setTab]=useState('edit');
  const [p1,setP1]=useState('40');
  const [p2,setP2]=useState('30');
  const client=S.cl[d.clientId]||null;
  const t=devisTotals(d);
  const up=patch=>api.saveDevis(Object.assign({},d,patch),true);
  const upIn=(list,id,patch)=>up({[list]:d[list].map(x=>x.id===id?Object.assign({},x,patch):x)});
  const dropIn=(list,id)=>up({[list]:d[list].filter(x=>x.id!==id)});
  const enc=client?(S.enc[client.id]||0):0;
  const cout=client?S.assignRows.filter(a=>a.clientId===client.id).reduce((s,a)=>s+(Number(a.convenu)||0),0):0;
  const pf=docProfileOf(data);
  const ci=ciOf(d,client);
  const body=useMemo(()=>devisDocBody(d,client,cx,docProfileOf(data)),[d,client,cx,data.docProfile]);
  const gen=()=>up({echeances:genEcheancier(d,client?client.date:'',pnum(p1),pnum(p2))});
  const balance=()=>{
    if(!d.echeances.length)return;
    const last=d.echeances[d.echeances.length-1];
    upIn('echeances',last.id,{montant:String(Math.max(0,Math.round(pnum(last.montant)+t.reste)))});
  };
  return html`<div>
    <button class="btn btn-ghost btn-sm" onClick=${props.onBack} style=${{marginBottom:12}}><${Icon} name="ArrowLeft" size=${14} /> Tous les documents</button>
    <${PageHead} eyebrow=${d.type==='Facture'?'Facture pro-forma':'Devis pro-forma'} title=${d.numero||'Sans numéro'} sub=${client?client.nom:'Client à choisir'}>
      <div class="tabs"><button class=${tab==='edit'?'on':''} onClick=${()=>setTab('edit')}><${Icon} name="Pencil" size=${14} /> Édition</button><button class=${tab==='doc'?'on':''} onClick=${()=>setTab('doc')}><${Icon} name="Eye" size=${14} /> Aperçu & impression</button></div>
    <//>

    ${tab==='doc'?html`<${DocPreview} title=${(d.type==='Facture'?'Facture pro-forma ':'Devis pro-forma ')+d.numero} filename=${slug((d.type==='Facture'?'facture-':'devis-')+d.numero)} body=${body} notify=${props.notify} />`:html`
    <div class="grid gap-3 lg:grid-cols-3">
      <div class="lg:col-span-2 flex flex-col gap-3">
        <section class="card pad grid gap-3 sm:grid-cols-2" style=${{padding:16}}>
          <${Field} id="dv-type" label="Type"><select id="dv-type" class="input" value=${d.type} onChange=${e=>up({type:e.target.value})}><option value="Devis">Devis pro-forma</option><option value="Facture">Facture pro-forma</option></select><//>
          <${Field} id="dv-num" label="Numéro"><input id="dv-num" class="input mono" value=${d.numero} onChange=${e=>up({numero:e.target.value})} /><//>
          <${Field} id="dv-client" label="Client" cls="sm:col-span-2"><select id="dv-client" class="input" value=${d.clientId} onChange=${e=>{const c=S.cl[e.target.value];up({clientInfo:undefined,clientId:e.target.value,objet:d.objet||(c?c.typeEvt:'')});}}><option value="">— À choisir —</option>${data.clients.map(c=>html`<option key=${c.id} value=${c.id}>${c.nom}</option>`)}</select><//>
          <${Field} id="dv-obj" label="Objet" cls="sm:col-span-2"><input id="dv-obj" class="input" value=${d.objet} onChange=${e=>up({objet:e.target.value})} placeholder="Ex. : Mariage coutumier, 150 invités" /><//>
          <${Field} id="dv-date" label="Date"><input id="dv-date" class="input" type="date" value=${d.date} onChange=${e=>up({date:e.target.value})} /><//>
          <${Field} id="dv-val" label="Valable jusqu'au"><input id="dv-val" class="input" type="date" value=${d.validite} onChange=${e=>up({validite:e.target.value})} /><//>
          <${Field} id="dv-stat" label="Statut"><select id="dv-stat" class="input" value=${d.statut} onChange=${e=>up({statut:e.target.value})}>${DOC_STATUTS.map(s=>html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
          <${Field} id="dv-marge" label="Marge agence (% sur les prestations)"><input id="dv-marge" class="input num" type="number" min="0" step="1" inputMode="decimal" value=${d.margePct} onChange=${e=>up({margePct:e.target.value})} /><//>
        </section>

        <section class="card pad" style=${{padding:16}}>
          <h2 style=${{marginBottom:4}}>Émetteur et client</h2>
          <p class="muted" style=${{fontSize:12.5,marginBottom:10}}>Ces coordonnées s'affichent sur le document. Les infos du client sont propres à ce document (la fiche client n'est pas modifiée) ; celles de l'émetteur, le logo et la signature servent à tous les documents.</p>
          <div class="grid gap-3 md:grid-cols-2">
            <${PartyFields} title="Émetteur" pid="em" withSociete=${true} values=${pf} onChange=${(k,v)=>api.saveDocProfile({[k]:v})} />
            <${PartyFields} title="Client" pid="cl" values=${ci} onChange=${(k,v)=>up({clientInfo:Object.assign({},ci,{[k]:v})})}>
              <div style=${{marginTop:8}}><button type="button" class="btn btn-ghost btn-sm" disabled=${!client} onClick=${()=>up({clientInfo:undefined})}><${Icon} name="RotateCcw" size=${13} /> Recharger depuis la fiche client</button></div>
            <//>
          </div>
          <datalist id="villes-doc">${VILLES.filter(v=>v!=='Autre').map(v=>html`<option key=${v} value=${v}></option>`)}</datalist>
          <div class="grid gap-3 md:grid-cols-2" style=${{marginTop:14}}>
            <${ImageSlot} label="Logo" value=${pf.logo} max=${420} notify=${props.notify} shown=${d.showLogo!==false} onShown=${v=>up({showLogo:v})} onChange=${u=>api.saveDocProfile({logo:u})} />
            <${ImageSlot} label="Signature" value=${pf.signature} max=${520} notify=${props.notify} shown=${d.showSignature!==false} onShown=${v=>up({showSignature:v})} onChange=${u=>api.saveDocProfile({signature:u})} />
          </div>
        </section>

        <section class="card pad" style=${{padding:16}}>
          <div class="flex items-center justify-between gap-2" style=${{marginBottom:6}}>
            <div><h2>Frais fixes non remboursables</h2><p class="muted" style=${{fontSize:12.5}}>Dus avant démarrage. Cochez, modifiez le montant ou supprimez.</p></div>
            <button class="btn btn-ghost btn-sm" onClick=${()=>up({frais:d.frais.concat([{id:uid(),libelle:'Nouveau frais',montant:'0',on:true}])})}><${Icon} name="Plus" size=${14} /> Frais</button>
          </div>
          ${d.frais.length===0&&html`<p class="muted">Aucun frais fixe.</p>`}
          ${d.frais.map(f=>html`<div key=${f.id} class="frow">
            <input type="checkbox" class="check" style=${{marginTop:0}} checked=${!!f.on} onChange=${e=>upIn('frais',f.id,{on:e.target.checked})} aria-label=${'Inclure : '+f.libelle} />
            <input class="input" value=${f.libelle} onChange=${e=>upIn('frais',f.id,{libelle:e.target.value})} aria-label="Libellé du frais" />
            <input class="input num" type="number" min="0" step="1000" inputMode="numeric" value=${f.montant} onChange=${e=>upIn('frais',f.id,{montant:e.target.value})} aria-label="Montant en FCFA" />
            <${DelBtn} onDelete=${()=>dropIn('frais',f.id)} label="Supprimer le frais" />
          </div>`)}
          <div class="flex flex-wrap items-center gap-2" style=${{marginTop:6}}><button class="btn btn-ghost btn-sm" onClick=${()=>up({frais:(data.settings.fraisDefaut||[]).map(f=>({id:uid(),libelle:f.libelle,montant:String(f.montant),on:true}))})}><${Icon} name="RotateCcw" size=${13} /> Recharger les frais par défaut</button><span class="muted" style=${{fontSize:12}}>Les frais par défaut se règlent avec l'icône des taux de change.</span></div>
        </section>

        <section class="card pad" style=${{padding:16}}>
          <div class="flex flex-wrap items-center justify-between gap-2" style=${{marginBottom:6}}>
            <div><h2>Achats, prestations & logistique</h2><p class="muted" style=${{fontSize:12.5}}>Libellé complet, quantité, prix unitaire et total de chaque ligne. Montants en FCFA.</p></div>
            <div class="flex flex-wrap gap-2">
              <select class="input" style=${{width:'auto',minHeight:34,padding:'4px 8px'}} value="" onChange=${e=>{const p=data.prestataires.find(x=>x.id===e.target.value);if(p)up({lignes:d.lignes.concat([mkLine(p.cat+' — '+p.nom,1,p.tarif||0)])});}} aria-label="Ajouter une ligne depuis un prestataire">
                <option value="">+ Depuis un prestataire…</option>${data.prestataires.map(p=>html`<option key=${p.id} value=${p.id}>${p.nom}</option>`)}</select>
              <button class="btn btn-ghost btn-sm" onClick=${()=>up({lignes:d.lignes.concat([mkLine('Nouvelle prestation',1,0)])})}><${Icon} name="Plus" size=${14} /> Ligne</button>
            </div>
          </div>
          ${d.lignes.length===0&&html`<p class="muted">Aucune ligne. Ajoutez une prestation ou importez-la depuis un prestataire.</p>`}
          ${d.lignes.map((l,idx)=>html`<div key=${l.id} class="lrow2">
            <div class="l2-n">${idx+1}</div>
            <div class="l2-main">
              <textarea class="input" rows="2" value=${l.libelle} onChange=${e=>upIn('lignes',l.id,{libelle:e.target.value})} aria-label=${'Libellé complet de la ligne '+(idx+1)} placeholder="Libellé complet de l'article ou de la prestation"></textarea>
              <input class="input" value=${l.detail||''} onChange=${e=>upIn('lignes',l.id,{detail:e.target.value})} aria-label=${'Détail de la ligne '+(idx+1)} placeholder="Détail (marque, format, durée, lieu… facultatif)" />
            </div>
            <div class="l2-del"><${DelBtn} onDelete=${()=>dropIn('lignes',l.id)} label=${'Supprimer la ligne '+(idx+1)} /></div>
            <div class="l2-nums">
              <label><span class="label">Quantité</span><input class="input num" type="number" min="0" step="1" inputMode="decimal" value=${l.qte} onChange=${e=>upIn('lignes',l.id,{qte:e.target.value})} /></label>
              <label><span class="label">Unité</span><input class="input" list="unites-doc" value=${l.unite||''} onChange=${e=>upIn('lignes',l.id,{unite:e.target.value})} placeholder="u, pers., jour…" /></label>
              <label><span class="label">Prix unitaire (FCFA)</span><input class="input num" type="number" min="0" step="500" inputMode="numeric" value=${l.pu} onChange=${e=>upIn('lignes',l.id,{pu:e.target.value})} /></label>
              <div><span class="label">Total de la ligne</span><${Amt} style=${{fontWeight:700}} v=${pnum(l.qte)*pnum(l.pu)} /></div>
            </div>
          </div>`)}
          <datalist id="unites-doc">${['unité','personne','jour','heure','forfait','lot','m²','véhicule'].map(u=>html`<option key=${u} value=${u}></option>`)}</datalist>
        </section>

        <section class="card pad" style=${{padding:16}}>
          <div class="flex flex-wrap items-end justify-between gap-2" style=${{marginBottom:6}}>
            <div><h2>Échéancier</h2><p class="muted" style=${{fontSize:12.5}}>Frais initiaux, acomptes échelonnés puis solde avant l'événement.</p></div>
            <div class="flex flex-wrap items-end gap-2">
              <div style=${{width:74}}><label class="label" for="dv-p1">Acompte 1 %</label><input id="dv-p1" class="input num" style=${{minHeight:34}} inputMode="numeric" value=${p1} onChange=${e=>setP1(e.target.value)} /></div>
              <div style=${{width:74}}><label class="label" for="dv-p2">Acompte 2 %</label><input id="dv-p2" class="input num" style=${{minHeight:34}} inputMode="numeric" value=${p2} onChange=${e=>setP2(e.target.value)} /></div>
              <button class="btn btn-gold btn-sm" onClick=${gen}><${Icon} name="Wand2" size=${14} /> Générer</button>
              <button class="btn btn-ghost btn-sm" onClick=${()=>up({echeances:d.echeances.concat([{id:uid(),libelle:'Échéance',montant:'0',date:'',paye:false}])})}><${Icon} name="Plus" size=${14} /> Ligne</button>
            </div>
          </div>
          ${d.echeances.length===0&&html`<p class="muted">Aucune échéance. « Générer » calcule les frais initiaux, deux acomptes et le solde à partir du total et de la date de l'événement (le solde = le reste après les deux acomptes).</p>`}
          ${d.echeances.map(e=>html`<div key=${e.id} class="erow">
            <input class="input e-lib" value=${e.libelle} onChange=${ev=>upIn('echeances',e.id,{libelle:ev.target.value})} aria-label="Libellé de l'échéance" />
            <input class="input num" type="number" min="0" step="1000" inputMode="numeric" value=${e.montant} onChange=${ev=>upIn('echeances',e.id,{montant:ev.target.value})} aria-label="Montant en FCFA" />
            <input class="input" type="date" value=${e.date} onChange=${ev=>upIn('echeances',e.id,{date:ev.target.value})} aria-label="Date limite" />
            <label class="flex items-center gap-1" style=${{cursor:'pointer',fontSize:12.5,fontWeight:600}}><input type="checkbox" class="check" style=${{marginTop:0}} checked=${!!e.paye} onChange=${ev=>upIn('echeances',e.id,{paye:ev.target.checked})} /> Payé</label>
            <div class="l-del"><${DelBtn} onDelete=${()=>dropIn('echeances',e.id)} label="Supprimer l'échéance" /></div>
          </div>`)}
          ${d.echeances.length>0&&html`<div class="flex flex-wrap items-center justify-between gap-2" style=${{marginTop:8,paddingTop:8,borderTop:'1px solid var(--line)'}}>
            <span class="num" style=${{fontSize:13}}>Planifié : <b>${cx.fm(t.planned)}</b></span>
            ${Math.abs(t.reste)<1?html`<span class="pill" style=${{background:'var(--ok-soft)',color:'var(--ok)'}}>Échéancier équilibré</span>`:html`<span class="flex flex-wrap items-center gap-2"><span class="pill" style=${{background:'var(--warn-soft)',color:'var(--warn)'}}>${t.reste>0?'Reste à planifier : ':'Excédent : '}${cx.fm(Math.abs(t.reste))}</span>
              <button class="btn btn-ghost btn-sm" onClick=${balance}>Équilibrer sur le solde</button></span>`}
          </div>`}
        </section>

        <section class="card pad" style=${{padding:16}}>
          <${Field} id="dv-notes" label="Notes affichées sur le document"><textarea id="dv-notes" class="input" value=${d.notes} onChange=${e=>up({notes:e.target.value})} placeholder="Conditions particulières, coordonnées bancaires, remarques…"></textarea><//>
        </section>
      </div>

      <aside class="flex flex-col gap-3">
        <section class="card kpi-hero pad" style=${{padding:16}}>
          <p class="eyebrow">Total du document</p>
          <${Amt} className="font-display" style=${{fontSize:26,fontWeight:700,marginTop:6}} v=${t.total} />
          <div class="flex flex-col gap-1" style=${{marginTop:12,fontSize:13,color:'#C9D0E3'}}>
            <div class="flex justify-between gap-2"><span>Frais fixes</span><b class="num" style=${{color:'#fff'}}>${cx.fm(t.frais)}</b></div>
            <div class="flex justify-between gap-2"><span>Prestations</span><b class="num" style=${{color:'#fff'}}>${cx.fm(t.prest)}</b></div>
            <div class="flex justify-between gap-2"><span>Marge agence (${pnum(d.margePct)} %)</span><b class="num" style=${{color:'#fff'}}>${cx.fm(t.marge)}</b></div>
          </div>
        </section>
        <section class="card pad" style=${{padding:16}}>
          <h3 style=${{marginBottom:10}}>Suivi réel du dossier</h3>
          ${!client?html`<p class="muted" style=${{fontSize:12.5}}>Choisissez un client pour voir les encaissements et la marge réelle.</p>`:html`<div class="flex flex-col gap-3" style=${{fontSize:13}}>
            <div><p class="muted" style=${{fontSize:11.5}}>Encaissé (caisse)</p><${Amt} className="pos" style=${{fontWeight:700}} v=${enc} /></div>
            <div><p class="muted" style=${{fontSize:11.5}}>Reste à encaisser sur ce document</p><${Amt} style=${{fontWeight:700}} v=${Math.max(0,t.total-enc)} /></div>
            <div><p class="muted" style=${{fontSize:11.5}}>Coûts prestataires convenus</p><${Amt} v=${cout} /></div>
            <div><p class="muted" style=${{fontSize:11.5}}>Marge brute prévue (total − coûts convenus)</p><${Amt} className=${t.total-cout<0?'neg':'pos'} style=${{fontWeight:700}} v=${t.total-cout} /></div>
            <div><p class="muted" style=${{fontSize:11.5}}>Marge nette réelle (encaissé − décaissé)</p><${Amt} className=${S.margeOf(client.id)<0?'neg':'pos'} style=${{fontWeight:800}} v=${S.margeOf(client.id)} /></div>
          </div>`}
        </section>
        <section class="card pad flex flex-col gap-2" style=${{padding:16}}>
          <button class="btn btn-primary" onClick=${()=>setTab('doc')}><${Icon} name="Printer" size=${16} /> Aperçu & impression</button>
          ${client&&html`<button class="btn btn-ghost" onClick=${()=>{api.applyBudget(client.id,t.total);}}><${Icon} name="ArrowRightLeft" size=${15} /> Appliquer le total au budget client</button>
          <button class="btn btn-ghost" onClick=${()=>props.openRecap(client.id)}><${Icon} name="FileText" size=${15} /> Récapitulatif financier</button>`}
          ${d.type==='Devis'&&html`<button class="btn btn-ghost" onClick=${()=>api.toFacture(d.id)}><${Icon} name="Receipt" size=${15} /> Créer la facture pro-forma</button>`}
          <button class="btn btn-ghost" onClick=${()=>api.dupDevis(d.id)}><${Icon} name="Copy" size=${15} /> Dupliquer</button>
          <div class="flex items-center justify-between gap-2" style=${{marginTop:4}}><span class="muted" style=${{fontSize:12.5}}>Supprimer ce document</span><${DelBtn} onDelete=${()=>{api.delDevis(d.id);props.onBack();}} label="Supprimer le document" size=${16} /></div>
        </section>
      </aside>
    </div>`}
  </div>`;
}
function Finance(props){
  const {data,S,api,selDevis,setSelDevis}=props;
  const [flt,setFlt]=useState('Tous');
  const [nw,setNw]=useState(null);
  const d=selDevis?data.devis.find(x=>x.id===selDevis):null;
  if(d)return html`<${DevisEditor} data=${data} S=${S} api=${api} d=${d} notify=${props.notify} onBack=${()=>setSelDevis('')} openRecap=${props.openRecap} />`;
  const docs=data.devis.filter(x=>flt==='Tous'||x.type===flt).slice().sort((a,b)=>a.date<b.date?1:-1);
  const sum=data.devis.reduce((s,x)=>s+devisTotals(x).total,0);
  return html`<div>
    <${PageHead} eyebrow="Finance" title="Devis & Facturation" sub="Devis et factures pro-forma avec frais fixes, marge agence, échéancier et conversions en € et $">
      <button class="btn btn-primary" onClick=${()=>setNw({})}><${Icon} name="Plus" size=${16} /> Nouveau devis</button>
    <//>
    <div class="grid gap-3 sm:grid-cols-3" style=${{marginBottom:12}}>
      <div class="card pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Documents</p><p class="font-display num" style=${{fontSize:22,fontWeight:700,marginTop:4}}>${data.devis.length}</p></div>
      <div class="card pad" style=${{padding:'14px 16px'}}><p class="eyebrow">Valeur cumulée</p><${Amt} className="font-display" style=${{fontSize:19,fontWeight:700,marginTop:4}} v=${sum} /></div>
      <div class="card pad" style=${{padding:'14px 16px'}}><p class="eyebrow">En attente de réponse</p><${Amt} className="font-display" style=${{fontSize:19,fontWeight:700,marginTop:4}} v=${S.devisOpenTotal} /></div>
    </div>
    <${MargePanel} data=${data} S=${S} openRecap=${props.openRecap} />
    <div class="chips" style=${{margin:'16px 0 10px'}}>
      ${['Tous','Devis','Facture'].map(f=>html`<button key=${f} class=${'chip'+(flt===f?' on':'')} onClick=${()=>setFlt(f)}>${f==='Tous'?'Tous les documents':f==='Devis'?'Devis':'Factures'}</button>`)}
    </div>
    ${docs.length===0?html`<${Empty} icon="Receipt" title="Aucun document" text="Créez un devis pro-forma pour un client : frais fixes, lignes de prestation, marge et échéancier." />`:html`<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      ${docs.map(x=>{
        const t=devisTotals(x);const c=S.cl[x.clientId];
        return html`<article key=${x.id} class="card flex flex-col gap-3" style=${{padding:16}}>
          <div class="flex items-start justify-between gap-2">
            <div style=${{minWidth:0}}><p class="mono" style=${{fontWeight:800,fontSize:13}}>${x.numero}</p><h3 style=${{overflowWrap:'anywhere',marginTop:2}}>${c?c.nom:'Client à choisir'}</h3>
              <p class="muted" style=${{fontSize:12.5}}>${x.objet||'—'}</p></div>
            <span class="pill" style=${{background:x.type==='Facture'?'var(--gold-soft)':'var(--violet-soft)',color:x.type==='Facture'?'#7A5F0A':'var(--violet)'}}>${x.type==='Facture'?'Facture':'Devis'}</span>
          </div>
          <${Amt} className="font-display" style=${{fontSize:20,fontWeight:700}} v=${t.total} />
          <div class="grid grid-cols-2 gap-2">
            <${Field} id=${'ds-'+x.id} label="Statut"><select id=${'ds-'+x.id} class="input" value=${x.statut} onChange=${e=>api.saveDevis(Object.assign({},x,{statut:e.target.value}),true)}>${DOC_STATUTS.map(s=>html`<option key=${s} value=${s}>${s}</option>`)}</select><//>
            <div><p class="label">Date</p><p style=${{padding:'9px 0',fontWeight:600}}>${fdate(x.date)}</p></div>
          </div>
          ${Math.abs(t.reste)>=1&&x.echeances.length>0&&html`<p class="pill" style=${{background:'var(--warn-soft)',color:'var(--warn)',alignSelf:'flex-start'}}>Échéancier à équilibrer</p>`}
          <hr class="divider" />
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn btn-primary btn-sm" onClick=${()=>setSelDevis(x.id)}><${Icon} name="Pencil" size=${14} /> Ouvrir</button>
            <button class="btn btn-ghost btn-sm" onClick=${()=>api.dupDevis(x.id)}><${Icon} name="Copy" size=${14} /> Dupliquer</button>
            <span style=${{marginLeft:'auto'}}><${DelBtn} onDelete=${()=>api.delDevis(x.id)} label=${'Supprimer '+x.numero} /></span>
          </div>
        </article>`;
      })}
    </div>`}
    ${nw&&html`<${NewDevisModal} clients=${data.clients} clientId=${nw.clientId} onCreate=${(cid,type)=>{const id=api.createDevis(cid,type);setSelDevis(id);}} onClose=${()=>setNw(null)} />`}
  </div>`;
}

function AdjustModal(props){
  const [mode,setMode]=useState(MODES[0]);
  const curOf=m=>props.S.byMode[m].e-props.S.byMode[m].s;
  const [target,setTarget]=useState(String(curOf(MODES[0])));
  const t=Math.round(pnum(target));
  const cur=curOf(mode);
  const diff=t-cur;
  const pick=m=>{setMode(m);setTarget(String(curOf(m)));};
  const submit=e=>{e.preventDefault();if(!diff)return;props.onSave(mode,t);props.onClose();};
  return html`<${Modal} title="Ajuster un solde de caisse" onClose=${props.onClose}>
    <form onSubmit=${submit} class="flex flex-col gap-3">
      <p class="muted">Corrigez le solde d'un canal pour qu'il corresponde au montant réellement constaté. Une ligne de régularisation est ajoutée au journal ; vous pouvez la modifier ou la supprimer à tout moment.</p>
      <${Field} id="aj-mode" label="Canal"><select id="aj-mode" class="input" value=${mode} onChange=${e=>pick(e.target.value)}>${MODES.map(m=>html`<option key=${m} value=${m}>${m}</option>`)}</select><//>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><p class="label">Solde actuel dans l'application</p><${Amt} style=${{fontWeight:700}} v=${cur} /></div>
        <${Field} id="aj-target" label="Solde réel constaté (FCFA)"><input id="aj-target" class="input num" type="number" step="500" inputMode="numeric" value=${target} onChange=${e=>setTarget(e.target.value)} /><//>
      </div>
      <div class="card" style=${{padding:'10px 14px',background:'var(--violet-soft)',borderColor:'transparent'}}>
        <p class="eyebrow">Régularisation</p>
        ${diff===0?html`<p class="muted">Aucun écart à corriger.</p>`:html`<${Amt} className=${diff>0?'pos':'neg'} style=${{fontWeight:800}} v=${diff} sign=${true} />`}
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" onClick=${props.onClose}>Annuler</button>
        <button type="submit" class="btn btn-primary" disabled=${diff===0}><${Icon} name="Check" size=${16} /> Enregistrer l'ajustement</button>
      </div>
    </form>
  <//>`;
}
/* ---------- Application ---------- */
function SyncBadge(props){
  const s=props.s;
  const M={
    off:{icon:'CloudOff',color:'#AEB7CF',label:'Local seulement',tip:'Supabase non configuré : les données restent sur cet appareil (localStorage).'},
    loading:{icon:'RefreshCw',color:'#E6C85A',label:'Connexion…',tip:'Connexion à Supabase en cours.'},
    saving:{icon:'RefreshCw',color:'#E6C85A',label:'Enregistrement…',tip:'Envoi des modifications vers Supabase.'},
    ok:{icon:'Cloud',color:'#7BE0B5',label:'Synchronisé',tip:'Données synchronisées avec Supabase.'+(s.lastSync?' Dernière synchro : '+s.lastSync.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'')},
    error:{icon:'CloudOff',color:'#FF9AA8',label:'Hors ligne',tip:'Supabase injoignable : vos données sont gardées sur cet appareil et seront envoyées dès que possible. Cliquez pour réessayer.'}
  };
  const m=M[s.status]||M.off;
  return html`<button type="button" onClick=${s.retry} title=${m.tip} aria-label=${'Synchronisation : '+m.label} style=${{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.14)',borderRadius:99,padding:'5px 10px',color:m.color,fontSize:11.5,fontWeight:700,cursor:s.enabled?'pointer':'default',whiteSpace:'nowrap'}}>
    <${Icon} name=${m.icon} size=${14} /><span class="hidden sm:inline">${m.label}</span>
  </button>`;
}
function App(){
  const [data,setData]=useState(load);
  const [tab,setTab]=useState(()=>{const h=(location.hash||'').replace('#','');return TABS.some(t=>t.id===h)?h:'dash';});
  const [sub,setSub]=useState('journal');
  const [psub,setPsub]=useState('annuaire');
  const [jf,setJf]=useState({mode:'',cat:'',n:0});
  const [sel,setSel]=useState('');
  const [selDevis,setSelDevis]=useState('');
  const [txModal,setTxModal]=useState(null);
  const [clientModal,setClientModal]=useState(null);
  const [recap,setRecap]=useState('');
  const [ratesOpen,setRatesOpen]=useState(false);
  const [adjustOpen,setAdjustOpen]=useState(false);
  const [articleModal,setArticleModal]=useState(false);
  const [prestaModal,setPrestaModal]=useState(false);
  const [toast,setToast]=useState('');
  const toastT=useRef(0);
  useEffect(()=>{persist(data);},[data]);
  const sync=useCloudSync(data,setData,migrate);
  useEffect(()=>{
    const f=()=>{const h=(location.hash||'').replace('#','');if(TABS.some(t=>t.id===h))setTab(h);};
    window.addEventListener('hashchange',f);
    return()=>window.removeEventListener('hashchange',f);
  },[]);
  const notify=msg=>{setToast(msg);clearTimeout(toastT.current);toastT.current=setTimeout(()=>setToast(''),3400);};
  const go=id=>{try{location.hash=id;}catch(e){}setTab(id);window.scrollTo(0,0);};
  const nav=id=>{if(id==='projets')setSel('');if(id==='devis')setSelDevis('');go(id);};
  const cx=useMemo(()=>mkCx(data.settings),[data.settings]);
  const S=useMemo(()=>computeStats(data),[data]);
  const setSettings=p=>setData(d=>Object.assign({},d,{settings:Object.assign({},d.settings,p)}));
  const purgeFiles=()=>data.prestataires.forEach(p=>(p.files||[]).forEach(f=>fileStore.del(f.id)));
  const upsert=(list,item)=>list.some(x=>x.id===item.id)?list.map(x=>x.id===item.id?item:x):list.concat([item]);
  const ensureAssign=(assign,t)=>{
    if(t.prestaId&&t.clientId&&!assign.some(a=>a.prestaId===t.prestaId&&a.clientId===t.clientId))
      return assign.concat([{id:uid(),prestaId:t.prestaId,clientId:t.clientId,prestation:'À préciser',convenu:0}]);
    return assign;
  };

  const api={
    saveClient:c=>{setData(d=>Object.assign({},d,{clients:d.clients.some(x=>x.id===c.id)?d.clients.map(x=>x.id===c.id?c:x):[c].concat(d.clients)}));notify('Fiche client enregistrée');},
    patchClient:(id,p)=>setData(d=>Object.assign({},d,{clients:d.clients.map(c=>c.id===id?Object.assign({},c,p):c)})),
    delClient:id=>{setData(d=>Object.assign({},d,{
      clients:d.clients.filter(c=>c.id!==id),
      tasks:d.tasks.filter(t=>t.clientId!==id),
      assign:d.assign.filter(a=>a.clientId!==id),
      devis:d.devis.map(x=>x.clientId===id?Object.assign({},x,{clientId:''}):x),
      transactions:d.transactions.map(t=>{if(t.clientId===id){const n=Object.assign({},t);delete n.clientId;return n;}return t;})
    }));if(sel===id)setSel('');notify('Fiche supprimée');},
    addTx:t=>{setData(d=>{const seq=d.seq+1;const tx=Object.assign({id:uid(),ref:mkRef(t.date,seq)},t);return Object.assign({},d,{seq:seq,assign:ensureAssign(d.assign,tx),transactions:d.transactions.concat([tx])});});notify('Opération enregistrée');},
    saveTx:t=>{setData(d=>{
      const old=d.transactions.find(x=>x.id===t.id);if(!old)return d;
      let articles=d.articles;
      if(old.vente&&t.vente&&t.vente.qte!==old.vente.qte){const diff=t.vente.qte-old.vente.qte;articles=articles.map(a=>a.id===t.vente.articleId?Object.assign({},a,{stock:Math.max(0,a.stock-diff)}):a);}
      if(old.reappro&&t.reappro&&t.reappro.qte!==old.reappro.qte){const diff=t.reappro.qte-old.reappro.qte;articles=articles.map(a=>a.id===t.reappro.articleId?Object.assign({},a,{stock:Math.max(0,a.stock+diff)}):a);}
      return Object.assign({},d,{articles:articles,assign:ensureAssign(d.assign,t),transactions:d.transactions.map(x=>x.id===t.id?t:x)});
    });notify('Opération modifiée, soldes recalculés');},
    delTx:id=>{setData(d=>{
      const t=d.transactions.find(x=>x.id===id);if(!t)return d;
      let articles=d.articles;
      if(t.vente)articles=articles.map(a=>a.id===t.vente.articleId?Object.assign({},a,{stock:a.stock+t.vente.qte}):a);
      if(t.reappro)articles=articles.map(a=>a.id===t.reappro.articleId?Object.assign({},a,{stock:Math.max(0,a.stock-t.reappro.qte)}):a);
      return Object.assign({},d,{articles:articles,transactions:d.transactions.filter(x=>x.id!==id)});
    });notify('Opération supprimée');},
    addFrais:(c,items,mode)=>{setData(d=>{
      let seq=d.seq;const date=todayISO();
      const txs=items.map(i=>{seq+=1;return {id:uid(),ref:mkRef(date,seq),date:date,libelle:i.libelle,categorie:CAT_PREST,mode:mode,entree:i.montant,sortie:0,clientId:c.id};});
      const clients=d.clients.map(x=>x.id===c.id&&x.statut==='Lead WhatsApp'?Object.assign({},x,{statut:'Frais initiaux payés'}):x);
      return Object.assign({},d,{seq:seq,clients:clients,transactions:d.transactions.concat(txs)});
    });notify('Frais initiaux encaissés');},
    saveArticle:a=>{setData(d=>Object.assign({},d,{articles:upsert(d.articles,a)}));notify('Article enregistré');},
    delArticle:id=>{setData(d=>Object.assign({},d,{articles:d.articles.filter(a=>a.id!==id)}));notify('Article supprimé');},
    sell:v=>{setData(d=>{
      const a=d.articles.find(x=>x.id===v.articleId);
      if(!a||v.qte<1||v.qte>a.stock)return d;
      const seq=d.seq+1;
      const tx={id:uid(),ref:mkRef(v.date,seq),date:v.date,libelle:'Vente : '+a.nom+' × '+v.qte+(v.acheteur?' — '+v.acheteur:''),categorie:CAT_VENTE,mode:v.mode,entree:a.vente*v.qte,sortie:0,vente:{articleId:a.id,qte:v.qte}};
      return Object.assign({},d,{seq:seq,articles:d.articles.map(x=>x.id===a.id?Object.assign({},x,{stock:x.stock-v.qte}):x),transactions:d.transactions.concat([tx])});
    });notify('Vente enregistrée, stock et caisse mis à jour');},
    restock:v=>{setData(d=>{
      const a=d.articles.find(x=>x.id===v.articleId);if(!a)return d;
      const seq=d.seq+1;
      const tx={id:uid(),ref:mkRef(v.date,seq),date:v.date,libelle:'Réapprovisionnement : '+a.nom+' × '+v.qte,categorie:'Achat Stock/Fournitures',mode:v.mode,entree:0,sortie:a.achat*v.qte,reappro:{articleId:a.id,qte:v.qte}};
      return Object.assign({},d,{seq:seq,articles:d.articles.map(x=>x.id===a.id?Object.assign({},x,{stock:x.stock+v.qte}):x),transactions:d.transactions.concat([tx])});
    });notify('Stock mis à jour, sortie ajoutée à la caisse');},
    /* projets */
    saveTask:(t,quiet)=>{setData(d=>Object.assign({},d,{tasks:upsert(d.tasks,t)}));if(!quiet)notify('Tâche enregistrée');},
    toggleTask:id=>setData(d=>Object.assign({},d,{tasks:d.tasks.map(t=>t.id===id?Object.assign({},t,{done:!t.done}):t)})),
    delTask:id=>{setData(d=>Object.assign({},d,{tasks:d.tasks.filter(t=>t.id!==id)}));notify('Tâche supprimée');},
    genTasks:(c,resps)=>{
      const have={};data.tasks.filter(t=>t.clientId===c.id).forEach(t=>{have[t.titre]=1;});
      const add=tplTasks(c,Object.keys(resps||{}).length?resps:DEMO_RESP).filter(t=>!have[t.titre]);
      if(!add.length){notify('La checklist type est déjà complète');return;}
      setData(d=>Object.assign({},d,{tasks:d.tasks.concat(add)}));
      notify(add.length+' tâche'+(add.length>1?'s ajoutées':' ajoutée')+' à la checklist');
    },
    clearTasks:id=>{setData(d=>Object.assign({},d,{tasks:d.tasks.filter(t=>t.clientId!==id)}));notify('Checklist vidée');},
    adjustSolde:(mode,target)=>{setData(d=>{
      let cur=0;d.transactions.forEach(t=>{if(t.mode===mode)cur+=t.entree-t.sortie;});
      const diff=Math.round(target)-cur;if(!diff)return d;
      const seq=d.seq+1;const date=todayISO();
      const tx={id:uid(),ref:mkRef(date,seq),date:date,libelle:'Régularisation de caisse — '+mode,categorie:'Frais Généraux',mode:mode,entree:diff>0?diff:0,sortie:diff<0?-diff:0};
      return Object.assign({},d,{seq:seq,transactions:d.transactions.concat([tx])});
    });notify('Solde ajusté : une ligne de régularisation a été ajoutée au journal');},
    addPrestaFiles:(pid,list)=>setData(d=>Object.assign({},d,{prestataires:d.prestataires.map(p=>p.id===pid?Object.assign({},p,{files:(p.files||[]).concat(list)}):p)})),
    delPrestaFile:(pid,fid)=>{fileStore.del(fid);setData(d=>Object.assign({},d,{prestataires:d.prestataires.map(p=>p.id===pid?Object.assign({},p,{files:(p.files||[]).filter(f=>f.id!==fid)}):p)}));notify('Fichier supprimé');},
    clearPrestaFiles:pid=>{const pp=data.prestataires.find(x=>x.id===pid);if(pp&&pp.files)pp.files.forEach(f=>fileStore.del(f.id));setData(d=>Object.assign({},d,{prestataires:d.prestataires.map(p=>p.id===pid?Object.assign({},p,{files:[]}):p)}));notify('Tous les fichiers du prestataire ont été supprimés');},
    clearPrestataires:()=>{data.prestataires.forEach(p=>(p.files||[]).forEach(f=>fileStore.del(f.id)));setData(d=>Object.assign({},d,{prestataires:[],assign:[]}));notify('Annuaire remis à zéro');},
    /* prestataires */
    savePresta:(p,quiet)=>{setData(d=>Object.assign({},d,{prestataires:upsert(d.prestataires,p)}));if(!quiet)notify('Fiche prestataire enregistrée');},
    delPresta:id=>{const pp=data.prestataires.find(x=>x.id===id);if(pp&&pp.files)pp.files.forEach(f=>fileStore.del(f.id));setData(d=>Object.assign({},d,{
      prestataires:d.prestataires.filter(p=>p.id!==id),
      assign:d.assign.filter(a=>a.prestaId!==id),
      transactions:d.transactions.map(t=>{if(t.prestaId===id){const n=Object.assign({},t);delete n.prestaId;return n;}return t;})
    }));notify('Prestataire supprimé');},
    saveAssign:a=>{setData(d=>Object.assign({},d,{assign:upsert(d.assign,a)}));notify('Affectation enregistrée');},
    delAssign:id=>{setData(d=>Object.assign({},d,{assign:d.assign.filter(a=>a.id!==id)}));notify('Affectation supprimée');},
    saveDocProfile:p=>setData(d=>Object.assign({},d,{docProfile:Object.assign({},d.docProfile||{},p)})),
    /* devis */
    saveDevis:(x,quiet)=>{setData(d=>Object.assign({},d,{devis:upsert(d.devis,x)}));if(!quiet)notify('Document enregistré');},
    delDevis:id=>{setData(d=>Object.assign({},d,{devis:d.devis.filter(x=>x.id!==id)}));notify('Document supprimé');},
    createDevis:(clientId,type)=>{
      const c=data.clients.find(x=>x.id===clientId)||null;
      const nd=newDevis(data.devis,c,type,data.settings.fraisDefaut);
      setData(d=>Object.assign({},d,{devis:d.devis.concat([nd])}));
      notify((type==='Facture'?'Facture':'Devis')+' créé : frais fixes ajoutés automatiquement');
      return nd.id;
    },
    dupDevis:id=>{
      const x=data.devis.find(v=>v.id===id);if(!x)return;
      const cp=JSON.parse(JSON.stringify(x));
      cp.id=uid();cp.numero=nextNumero(data.devis,x.type);cp.statut='Brouillon';cp.date=todayISO();
      ['frais','lignes','echeances'].forEach(k=>{cp[k]=cp[k].map(i=>Object.assign({},i,{id:uid()}));});
      cp.echeances=cp.echeances.map(e=>Object.assign({},e,{paye:false}));
      setData(d=>Object.assign({},d,{devis:d.devis.concat([cp])}));setSelDevis(cp.id);notify('Document dupliqué');
    },
    toFacture:id=>{
      const x=data.devis.find(v=>v.id===id);if(!x)return;
      const cp=JSON.parse(JSON.stringify(x));
      cp.id=uid();cp.type='Facture';cp.numero=nextNumero(data.devis,'Facture');cp.statut='Brouillon';cp.date=todayISO();
      ['frais','lignes','echeances'].forEach(k=>{cp[k]=cp[k].map(i=>Object.assign({},i,{id:uid()}));});
      setData(d=>Object.assign({},d,{devis:d.devis.concat([cp])}));setSelDevis(cp.id);notify('Facture pro-forma créée à partir du devis');
    },
    applyBudget:(clientId,total)=>{setData(d=>Object.assign({},d,{clients:d.clients.map(c=>c.id===clientId?Object.assign({},c,{budget:Math.round(total)}):c)}));notify('Budget du client mis à jour');}
  };

  const openJournal=f=>{setSub('journal');setJf({mode:f.mode||'',cat:f.cat||'',n:Date.now()});go('caisse');};
  const openProject=id=>{setSel(id);go('projets');};
  const openDevis=id=>{setSelDevis(id);go('devis');};
  const newDevisFor=cid=>{const id=api.createDevis(cid,'Devis');setSelDevis(id);go('devis');};
  const goAlert=a=>{
    if(a.sub){if(a.tab==='caisse')setSub(a.sub);if(a.tab==='presta')setPsub(a.sub);}
    if(a.sel)setSel(a.sel);
    if(a.devisId)setSelDevis(a.devisId);
    go(a.tab);
    if(a.edit){const c=data.clients.find(x=>x.id===a.edit);if(c)setClientModal(c);}
  };
  const onQuick=k=>{
    if(k==='client')setClientModal({});
    else if(k==='tx')setTxModal({prefill:null});
    else if(k==='article')setArticleModal(true);
    else if(k==='presta')setPrestaModal(true);
    else if(k==='devis'){const id=api.createDevis('','Devis');setSelDevis(id);go('devis');}
    else if(k==='tache'){setSel('');go('projets');notify('Ouvrez un projet pour ajouter une tâche à sa checklist');}
  };
  const onNewTx=pre=>setTxModal({prefill:pre});
  const onEditTx=t=>setTxModal({tx:t});
  const onEditClient=c=>setClientModal(c);
  const cur=TABS.find(t=>t.id===tab)||TABS[0];
  const recapClient=recap?data.clients.find(c=>c.id===recap):null;

  let view;
  if(tab==='dash')view=html`<${Dashboard} onQuick=${onQuick} onAdjust=${()=>setAdjustOpen(true)} data=${data} S=${S} go=${nav} goAlert=${goAlert} openJournal=${openJournal} openProject=${openProject} onNewTx=${onNewTx} onEditClient=${onEditClient}
    onResetDemo=${()=>{purgeFiles();setData(demo());notify('Données de démonstration rechargées');}} onClear=${()=>{purgeFiles();setData(d=>emptyData(d.settings));notify('Données effacées (taux de change conservés)');}} />`;
  else if(tab==='crm')view=html`<${CRM} data=${data} S=${S} api=${api} onNewTx=${onNewTx} onProject=${openProject} onDevis=${newDevisFor} fraisDefaut=${data.settings.fraisDefaut||[]} />`;
  else if(tab==='caisse')view=html`<${Caisse} data=${data} S=${S} api=${api} sub=${sub} setSub=${setSub} jf=${jf} onNewTx=${onNewTx} onEditTx=${onEditTx} notify=${notify} />`;
  else if(tab==='projets')view=html`<${Projets} data=${data} S=${S} api=${api} sel=${sel} setSel=${setSel} onEditClient=${onEditClient} openRecap=${setRecap} goPresta=${()=>{setPsub('suivi');go('presta');}} newDevis=${newDevisFor} openDevis=${openDevis} />`;
  else if(tab==='presta')view=html`<${Prestataires} data=${data} S=${S} api=${api} sub=${psub} setSub=${setPsub} onNewTx=${onNewTx} onEditTx=${onEditTx} notify=${notify} />`;
  else view=html`<${Finance} data=${data} S=${S} api=${api} selDevis=${selDevis} setSelDevis=${setSelDevis} notify=${notify} openRecap=${setRecap} />`;

  return html`<${Cx.Provider} value=${cx}><div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="logo">A</div><div><b>AXELOG</b><small>Consulting Event's</small></div></div>
      <nav class="nav" aria-label="Navigation principale">
        ${TABS.map(t=>html`<button key=${t.id} class=${'nv'+(tab===t.id?' on':'')} onClick=${()=>nav(t.id)} aria-current=${tab===t.id?'page':undefined}>
          <${Icon} name=${t.icon} size=${18} />${t.label}
        </button>`)}
      </nav>
      <div class="side-foot">Pointe-Noire · Brazzaville<br />Saisie en FCFA, équivalents en € et $.<br />Sauvegarde automatique : cloud + copie locale.</div>
    </aside>
    <div style=${{flex:1,minWidth:0}}>
      <header class="topbar">
        <div class="logo" style=${{width:32,height:32,fontSize:16}}>A</div>
        <div style=${{minWidth:0}}><p style=${{fontFamily:'var(--font-display)',fontWeight:700,fontSize:15,lineHeight:1.1}}>AXELOG Events</p><p style=${{fontSize:11,color:'#AEB7CF',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>${cur.label}</p></div>
        <div style=${{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}><${SyncBadge} s=${sync} /><${CurBar} setCur=${c=>setSettings({display:c})} onRates=${()=>setRatesOpen(true)} /></div>
      </header>
      <main class="main">
        <div class="deskbar"><span class="muted" style=${{fontSize:12.5}}>Devise d'affichage</span><${CurBar} setCur=${c=>setSettings({display:c})} onRates=${()=>setRatesOpen(true)} /></div>
        <div class="wrap">${view}</div>
      </main>
    </div>
    <nav class="bottom-nav" aria-label="Navigation principale">
      ${TABS.map(t=>html`<button key=${t.id} class=${'bn'+(tab===t.id?' on':'')} onClick=${()=>nav(t.id)} aria-label=${t.label}><${Icon} name=${t.icon} size=${20} /><span>${t.short}</span></button>`)}
    </nav>
    ${txModal&&html`<${TxModal} tx=${txModal.tx} prefill=${txModal.prefill} clients=${data.clients} prestas=${data.prestataires} articles=${data.articles} onSave=${txModal.tx?api.saveTx:api.addTx} onClose=${()=>setTxModal(null)} />`}
    ${articleModal&&html`<${ArticleForm} article=${null} onSave=${api.saveArticle} onClose=${()=>setArticleModal(false)} />`}
    ${prestaModal&&html`<${PrestaForm} presta=${null} cat=${''} onSave=${p=>api.savePresta(p)} onClose=${()=>setPrestaModal(false)} />`}
    ${clientModal&&html`<${ClientForm} client=${clientModal.id?clientModal:null} onSave=${api.saveClient} onClose=${()=>setClientModal(null)} />`}
    ${adjustOpen&&html`<${AdjustModal} S=${S} onSave=${api.adjustSolde} onClose=${()=>setAdjustOpen(false)} />`}
    ${ratesOpen&&html`<${RatesModal} settings=${data.settings} onChange=${setSettings} onClose=${()=>setRatesOpen(false)} />`}
    ${recapClient&&html`<${RecapModal} client=${recapClient} data=${data} S=${S} notify=${notify} onClose=${()=>setRecap('')} />`}
    ${toast&&html`<div class="toast" role="status">${toast}</div>`}
  </div><//>`;
}


export default App;
