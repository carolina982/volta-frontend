import { JSXElementConstructor, Key, ReactElement, ReactNode, ReactPortal, useState } from "react";
import { Button, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useStore } from "../context/Store";

export default  function EditUnitsPage (){
     const {units , updateUnit, currentUser} = useStore () ;
     const [selectedUnit , setSelectedUnit ] = useState<string |null > (null) ;
     const [newItem ,setNewItem] =useState ("") ;
     if (!currentUser || currentUser.rol?.toLocaleLowerCase()! == "admin")
     {
        return <Text style ={{padding :20 }}>Solo administradores pueden editar unidades</Text>
     }
     const handleAddItem =() =>{
        if (!selectedUnit || !newItem.trim ())
            return ; 
        const unit =units.find ((u) =>u.id === selectedUnit);
        if (!unit ) return ;
        const updated ={...unit,items :[...unit.items ,newItem]};
        updateUnit (updated);
        setNewItem ("");
     };
     const handleRemoveItem =(unitId:string , item:string) => {
        const unit = units.find ((u)=>u.id === unitId);
        if (!unit ) return ;
        const updated ={...unit ,items : unit.items.filter ((i: string)=> i!== item)};
        updateUnit (updated);
     };
      return (
        <View style ={styles.container }>
            <Text style = {styles.title}>Editar  Unidades</Text>
            <FlatList 
            data={units}
            keyExtractor={(u)=>u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({item}) =>(
                <View style ={styles.unitCard}>
                    <Text style ={styles.unitName}>{item.nombre}</Text>
                    <Text>Lista de Cosas :</Text> {item.items.map((i:string|number|bigint|boolean|ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined, idx: Key | null | undefined) =>(
                        <View key={idx} style ={styles.itemRow}>
                            <Text>-{i}</Text>
                            <Button title ="x"
                            onPress={()=>handleRemoveItem (item.id, i )} />
                             </View>))}
                            {selectedUnit === item.id ? (
                            <View style={styles.addRow}>
                            <TextInput 
                            placeholder ="Nuevo item "
                            value={newItem}
                            onChangeText={setNewItem}
                            style={styles.input}
                            />
                            <Button title="Agregar " onPress={handleAddItem} />
                            </View>
                    ):(
            <Button title="Editar esta unidad " onPress={() => setSelectedUnit (item.id)}/>
           )}
        </View>
      )}
    />
    </View>
  );
}

const styles =StyleSheet.create ({
    container : {flex :1 ,padding :20 ,backgroundColor :"#fff"},
    title : {fontSize : 24  , fontWeight:"bold" , marginBottom :20 } ,
    unitCard : {marginBottom : 20 , padding : 15 , borderWidth :1  , borderRadius :8 },
    unitName : { fontSize : 18  , fontWeight :"600" , marginBottom : 10 } ,
    itemRow : {flexDirection :"row" , justifyContent : "space-between", marginVertical :5},
    addRow: { flexDirection :"row" , alignItems : "center" , marginTop :10} ,
    input :{borderWidth :1 , padding :8 , flex : 1 , marginRight :10 , borderRadius:5},
});