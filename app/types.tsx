//Usuario 
export interface User {
    _id: string;
    id:string;
    nombre:string;
    apellido:string;
    email:string ;
    password?:string ;
    rol :"Admin" |"Chofer";
    photoUrl?:string |null;
}

//Unidad 
 export interface Unit {
    items: any;
    id:string;
    nombre:string;
    tipo:string;
    placa?:string;
 }

 //viatico
export interface Viatico {
  updatedAt: string | number | Date;
  fecha: string | number | Date;
  id: string;
  tripId: string;
  conceptos: { [key: string]: number };
  dieselCargas: number;
  dieselCosto: number;
  tag: number;
  facturaUrl?: string;
  total: number;
  createdAt: string;
  viajeNombre?:string;
  conductorNombre?:string;
  
}
//viaje 
export interface Trip{
    id:string;
    nombre:string;
    conductorId:string;
    conductorNombre?:any;
    destino:string;
    fechaInicio:String;
    fechaFin:string;
    unidades:string [];
    viaticos:string [];
    estado :"pendiente" |"en curso "| "finalizado";
}