*HEADING
************************************************************************
Project name:
tyre size:
OE:
user:
date:
************************************************************************
*parameter
****load details---------------------
load1_kg=
load2_kg=
load3_kg=
pressure1=
pressure2=
pressure3=
speed_kmph=
IA=
SA=
SR=
****RIM_details---------------------
width=
diameter=
**********-----------------------
Outer_diameter=
nomwidth=
aspratio=
************
inflation_pressure1=0.00689476*pressure1
inflation_pressure1=0.00689476*pressure2
inflation_pressure1=0.00689476*pressure3
load1=9.81*load1_kg
load2=9.81*load2_kg
load3=9.81*load3_kg
Outer_radius=Outer_diameter/2000
speed=speed_kmph*1000*1000/3600
****RIM_Movement---------------------
rimdisp_plus = 60.0
rimdisp_minus = -60.0
*************
initial_velocity=speed/Outer_radius
***********************Cornering*****************
