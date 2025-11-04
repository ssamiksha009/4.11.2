** ----------------------------------------------------------------
** This include-file computes the rim contour as a function of 
** the diameter D and width A (see ETRTO). Two halves are created.
** The hump is not taken into account.
**
** This approach is only valid for:
** 1) 5 degree drop-centre rims
** 2) Diameter: CODE 10 to 30
** 3) Width: 3J to 13.5J
**
** Assumptions:
** G = 17.3 (should be 17.3 +/- 0.6)
** R2 = 6.5 (should be equal to or less than 6.5)
** R1 = 9.5 (should be equal to or greater than 9.5)
** R3 = R1 ( should be equal to or less than R1)
** => B becomes 12.541381265149111 (should be between 11 and 15)
**
** Useful equations but independent of A and D are commented out
** ----------------------------------------------------------------
** diameter is given in mm
** width = given in mm
** In case w_rim is taken from Unilab (in inches):
** => Convert w_rim from inches to mm ; round off to the nearest 0.5:
**    width = 0.5*int((w_rim*25.4)*2.0+0.5)
*parameter
D2 = diameter*0.5
A2 = width*0.5

** --------------------------------------------------------------
** Starting point at the end of the rim, 0.5 mm below the top
** --------------------------------------------------------------

** deltaD = 0.5;
** Angle alfa corresponding to this delta:
** alfa = asin((R1 - deltaD)/R1);
** deltaA correspondig to this delta:
** deltaA = R1 * cos(alfa);
** y0 = A2 + R1 + deltaA = A2 + B
y0 = A2 + 12.541381265149111
minusy0 = -y0
** x0 = D2 + G - deltaD;
x0 = D2 + 16.8

** --------------------------------------------------------------
** Coordinate at the end of arc R1 (point 1)
** --------------------------------------------------------------

y1 = A2
minusy1 = -y1
** x1 = D2 + G - R1
x1 = D2 + 7.8

** --------------------------------------------------------------
** Center of arc R1 (R1c)
** --------------------------------------------------------------

** yR1c = A2 + R1
yR1c = A2 + 9.5
minusyR1c = -yR1c
xR1c = x1

** --------------------------------------------------------------
** Coordinate at the end of arc R2 (point 3)
** --------------------------------------------------------------

** Angle from vertical line to line with slope equal to 5 degrees
** =>  = 85 degrees
** phi = deg2rad(85.0)
** deltaA = R2 * cos(phi)
** y3 = A2 - R2 + deltaA
y3 = A2 - 5.933487672140222
minusy3 = -y3

** Point should be on line with slope = 5 degrees
** d = alfa * a + beta ; alfa = sin(deg2rad(5.0))
** a = 0 => d = D2 - A2*sin(deg2rad(5.0))
**   => beta = D2 - A2*sin(deg2rad(5.0))
beta = D2 - A2*0.087155742747658
** a = A2 => d = D2
**   => alfa = (D2 - beta) / A2 = sin(deg2rad(5.0))
** x3 = y3*alfa + beta;
x3 = y3*0.087155742747658 + beta

** --------------------------------------------------------------
** Coordinate at the beginning of arc R2 (point 2)
** --------------------------------------------------------------

y2 = y1
minusy2 = -y2
** x2 = x3 + R2 * sin(phi)
x2 = x3 + 6.475265537596346

** --------------------------------------------------------------
** Center of arc R2 (R2c)
** --------------------------------------------------------------

xR2c = x2
** yR2c = A2 - R2;
yR2c = A2 - 6.5
minusyR2c = -yR2c


** --------------------------------------------------------------
** Rim center (point 4)
** --------------------------------------------------------------

y4 = 0.0
x4 = beta

** ----------------------------------------------------------------
*Node
      1,           0.,           0.,           0.
*Nset, nset=LOWER_RIM_REFERENCE_POINT
1
*Surface, type=SEGMENTS, name=LOWER_RIM_MASTER_SURFACE
 START, <x4>, <y4>
 LINE, <x3>, <minusy3>
 CIRCL, <x2>, <minusy2>, <xR2c>, <minusyR2c>
 LINE, <x1>, <minusy1>
 CIRCL, <x0>, <minusy0>, <xR1c>, <minusyR1c>
*Rigid Body, ref node=LOWER_RIM_REFERENCE_POINT, analytical surface=LOWER_RIM_MASTER_SURFACE
** ----------------------------------------------------------------
*Node
      2,           0.,           0.,           0.
*Nset, nset=UPPER_RIM_REFERENCE_POINT
2,
*Surface, type=SEGMENTS, name=UPPER_RIM_MASTER_SURFACE
 START, <x0>, <y0>
 CIRCL, <x1>, <y2>, <xR1c>, <yR1c>
 LINE, <x2>, <y2>
 CIRCL, <x3>, <y3>, <xR2c>, <yR2c>
 LINE, <x4>, <y4>
*Rigid Body, ref node=UPPER_RIM_REFERENCE_POINT, analytical surface=UPPER_RIM_MASTER_SURFACE
** ----------------------------------------------------------------
