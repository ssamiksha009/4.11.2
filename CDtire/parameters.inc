*HEADING
************************************************************************
Project name:
tyre size:
OE:
user:
date:
************************************************************************
*parameter
****Inputs---------------------
pressure=32 		#in psi
load=555    		#in kgs        	
width=178 			# in mm
diameter=487.4 		#in mm
*****-----------Rim position-------
rimdisp_plus = 60.0
rimdisp_minus = -60.0
****constants -------------
psi_to_MPa=0.00689476
kg_to_N=9.80665
kmph_to_mmps=1000*1000.0/3600
**** camber ----------------
nc1=-6
pc1=6
pc2=3
**** speeds ----------------
speed1_kmph=5
speed2_kmph=30
speed3_kmph=60
speed4_kmph=90
speed5_kmph=160
**********************
s1=speed1_kmph*kmph_to_mmps
s2=speed2_kmph*kmph_to_mmps
s3=speed3_kmph*kmph_to_mmps
s4=speed4_kmph*kmph_to_mmps
s5=speed5_kmph*kmph_to_mmps
*********calculations***************************************************
**********PSI_to_MPa****************************
p1=0.00689476*pressure*0.8
p2=0.00689476*pressure*1.0
p3=0.00689476*pressure*1.2
l1=9.81*load*0.4
l2=9.81*load*0.8
l3=9.81*load*1.2
l4=9.81*load*1.6
l5=9.81*load*2
****************************************

