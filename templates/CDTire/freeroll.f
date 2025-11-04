C-----------------------------------------------------------------------
      subroutine urdfil(lstop,lovrwrt,kstep,kinc,pnewdt,time)
C     USER SUBROUTINE TO CONTROL INCREMENTATION FOR FREE ROLLING OR
C     SPECIFIC TARGET TORQUE
C
C     TODO: Check what happens with cutbacks!
C
C     Version history:
C     2013-01-26: First version based on free_rolling.f
C                 (not the one from the User manual, but adjusted)
C
C-----------------------------------------------------------------------

      include 'aba_param.inc'

      dimension array(513),jrray(nprecd,513),time(*),lout(2)
      equivalence (array(1),jrray(1,1))
      parameter (nmany = 999999,small=1.0d-6,smaller=1.0d-08)
      common /ktargettorque/ kinc0, kinc1, time0, time1
      common /ktargettorque/ omega0, omega1, domega, torque0, torque1
      common /ktargettorque/ kfirstnode, kflag, targettorque
      character*256 outdir,jobname,filename

C The following input is variable:
      include '0_freeroll_initial.inc'

C The rest is "fixed":
C      ldofusr = 5
      nodeusr = 3
      domegamax = 0.5d0
      domegastart = 1.0d-1
      omegastart = omegafr - domegastart
      pi = 4.0d0*datan(1.0d0)
      alpha_rad = (alpha*pi)/1.80d2
      gamma_rad = (gamma*pi)/1.80d2
      R_ca = dcos(alpha_rad)
      R_sa = dsin(alpha_rad)
      R_cg = dcos(gamma_rad)
      R_sg = dsin(gamma_rad)

C Tolerance for torque (ttol) =< 1.0
      ttol = 30.0
C Time step ~= 0.01 (once ttol is reached => skip to end)
      dtime = 0.01
C Factor alfa [0.0 ; 1.0] is used to scale domega => 1.0 = no scaling
      alfa = 1.0
C Kill job when free rolling situation is found (0 = no, 1 = yes):
      killjob = 0

      iunit = 101

C      write(102,'(A,2I5)') 'URDFIL ENTERED', kstep, kinc

      if (kstep.ne.kttstep .or. kflag.eq.1 .or. kinc.eq.0) return 

      call getoutdir(outdir,lenoutdir)
      call getjobname(jobname,lenjobname)
      filename = outdir(1:lenoutdir) // '/' // jobname(1:lenjobname)
     *           // '.tts'
      lenfilename = lenoutdir + lenjobname + 5

C------------------------ KINC = 1 -------------------------------------

      if (kinc.eq.1) then
         open(iunit,file=filename(1:lenfilename))
         write(iunit,1000)
         kinc0 = 0
         time0  = 0.0
         omega0 = 0.0
         torque0 = 0.0
         omega1 = omegastart
         domega = 0.0
C        FIND CURRENT INCREMENT
         call posfil(kstep,kinc,array,jrcd)
         if (jrcd .ne. 0) then
            close(iunit)
            call xit
            return
         end if
         kinc1 = jrray(1,9)
         time1 = array(4)
         if (time1.ne.time(1)) then
            print*, 'TIJDEN KLOPPEN NIET!!'
         endif
C        FIND THE TORQUE AT THIS INCREMENT
         lfnd1 = 0
         do k1=1,nmany
            call dbfile(0,array,jrcd)
            if (jrcd .ne. 0) goto 100
            key = jrray(1,2)
            if (key .eq. 104) then
               node = jrray(1,3)
               if (node .eq. nodeusr) then
C                  torque1 = array(3+ldofusr)
                  torque1x = array(7)
                  torque1y = array(8)
                  torque1z = array(9)
                  torque1 = -R_sa*R_cg*torque1x +
     ~                       R_ca*R_cg*torque1y +
     ~                            R_sg*torque1z
                  lfnd1 = 1
                  goto 100
               end if
            end if
         end do
         close(iunit)
         call xit
         return
 100     continue
         if (lfnd1 .eq. 0) then
            lout(1) = nodeusr
            lout(2) = ldofusr
            close(iunit)
            call xit
            return
         end if
C        UPDATE PNEWDT EN TIME1 (nieuwe tijd tijdens volgende increment)
         omega0 = omegastart
         omega1 = omegastart + domegastart
         domega = domegastart
         pnewdt = dtime
         time0 = time1
         time1 = time1 + dtime
         write(iunit,1006) time0, omega1, omega0
C         write(102,1006) time0, omega1, omega0
         close(iunit)
         return
      end if

C------------------------ KINC > 1 -------------------------------------

      open(iunit,file=filename(1:lenfilename),access='append')
C TIME en OMEGA al aangepast!
c      time0 = time1
c      omega0 = omega1
      kinc0 = kinc1
      torque0 = torque1

C     FIND CURRENT INCREMENT
      call posfil(kstep,kinc,array,jrcd)
      if (jrcd .ne. 0) then
         close(iunit)
         call xit
         return
      end if      
      time1 = array(4)
      if (time1.ne.time(1)) then
         print*, 'TIJDEN KLOPPEN NIET!!'
      endif
      kinc1 = jrray(1,9)
C     FIND THE TORQUE AT THIS INCREMENT
      lfnd1 = 0
      do k1=1,nmany
         call dbfile(0,array,jrcd)
         if (jrcd .ne. 0) goto 200
         key = jrray(1,2)
         if (key .eq. 104) then
            node = jrray(1,3)
            if (node .eq. nodeusr) then
C               torque1 = array(3+ldofusr)
               torque1x = array(7)
               torque1y = array(8)
               torque1z = array(9)
               torque1 = -R_sa*R_cg*torque1x +
     ~                    R_ca*R_cg*torque1y +
     ~                         R_sg*torque1z
               lfnd1 = 1
               goto 200
            end if
         end if
      end do
      close(iunit)
      call xit
      return
 200  continue
      if (lfnd1 .eq. 0) then
         lout(1) = nodeusr
         lout(2) = ldofusr
         close(iunit)
         call xit
         return
      end if      

C     ESTIMATE ANGULAR VELOCITY TO OBTAIN TARGET TORQUE
      denom = torque1-torque0
      write(iunit,1001) time0,torque0,omega0,time1,torque1,omega1
      if (abs(torque1-targettorque).le.ttol .or. abs(omega0-omega1).lt.
     ~    smaller) then
         write (iunit,1004)
         close(iunit)
         filename = outdir(1:lenoutdir) // '/' // jobname(1:lenjobname)
     ~              // '.fit'
         open(iunit,file=filename(1:lenfilename))
C		 write(iunit,1007), omega1
C       ! First line: keyword
         write(iunit,'(A)') '*PARAMETER'
C       ! Second line: name = value (scientific format)
         write(iunit,'(A,E18.10)') 'omegafr =', omega1
         close(iunit)
C        Kill job:
         if (killjob.eq.1) call xit
         kflag = 1
         pnewdt= 1.0d0 - time(1)
         return
      else if (abs(denom).lt.small*abs(torque1)) then
         write (iunit,1002) kinc1, kinc0
         domega = domegastart
      else
C         omegatarget = (omega0*torque1-omega1*torque0)/denom
         omegatarget = (omega0*(torque1-targettorque)-
     ~                  omega1*(torque0-targettorque))/denom
         write (iunit,1003) omegatarget
         domega = (omegatarget - omega1) * alfa
         if (abs(domega).gt.abs(domegamax)) then
            write (iunit,1005) domegamax
            domega = domega * abs(domegamax/domega)
         end if
      end if
      omega0 = omega1
      omega1 = omega1+domega
      pnewdt = dtime
      time0 = time1
      time1 = time1+pnewdt
      write(iunit,1006) time0, omega1, omega0
C      write(102,1006) time0, omega1, omega0
      close(iunit)

 1000 format(//,15x,'TARGET TORQUE SOLUTION CONTROL')
 1001 format(/,2x,'TORQUE AT TIME ',1PG12.5,' = ',1PG12.5,
     *     ' ( OMEGA = ',E18.10,' )',
     *     /,2x,'TORQUE AT TIME ',1PG12.5,' = ',1PG12.5,
     *     ' ( OMEGA = ',E18.10,' )')
 1002 format(/,2x,'TORQUE AT CURRENT INCREMENT (',I5,
     *     ') AND PREVIOUS INCREMENT (',I5,') ARE THE SAME.',
     *     /,2x,'CONTINUE WITH REGULAR INCREMENTATION.',/)
 1003 format(2x,'TARGET TORQUE ESTIMATED TO OCCUR AT SPEED ',E18.10)
 1004 format(/,2x,'TARGET TORQUE SOLUTION OBTAINED.',
     *     ' END STEP.',//)
 1005 format(2x,'ESTIMATED INCREMENT TO OBTAIN TARGET TORQUE',
     *     ' EXCEEDS ',1PG12.5,
     *     /,2x,'CONTINUE WITH REGULAR INCREMENTATION.',/)
 1006 format(/2x,'END CALCULATIONS AT TIME ',E18.10,
     *     '  NEW ANGULAR VELOCITY ESTIMATED AT ',E18.10,
     *     ' ( PREVIOUS ESTIMATE ',E18.10,' )',/)
 1007 format('      omegafr = ',E18.10)

      return
      end

C-----------------------------------------------------------------------
      subroutine umotion(u,kstep,kinc,time,node,jdof)
C     User subroutine to define motion for free-rolling or specific
C     target torque
C-----------------------------------------------------------------------

      include 'aba_param.inc'

      dimension time(2)
      common /ktargettorque/ kinc0, kinc1, time0, time1
      common /ktargettorque/ omega0, omega1, domega, torque0, torque1
      common /ktargettorque/ kfirstnode, kflag, targettorque

      character*256 outdir,jobname,filename

C The following input is variable:
      include '0_freeroll_initial.inc'

C The rest is "fixed":
C      ldofusr = 5
      nodeusr = 3
      domegamax = 0.5d0
      domegastart = 1.0d-1
      omegastart = omegafr - domegastart

C Tolerance for torque (ttol) =< 1.0
      ttol = 10.0
C Time step ~= 0.01 (once ttol is reached => skip to end)
      dtime = 0.01
C Factor alfa [0.0 ; 1.0] is used to scale domega => 1.0 = no scaling
      alfa = 1.0
C Kill job when free rolling situation is found (0 = no, 1 = yes):
      killjob = 0

C KINC = 0 ---> SKIP
      if (kinc.eq.0) return

C KINC = 1 ---> INIT + CHECK WAARDE VAN OPGEGEVEN OMEGA
      if (kinc.eq.1) then
         if (kfirstnode.eq.0) then
            kfirstnode = node
            kflag = 0
         endif
         u = omegastart
         return
      end if

C CHECK FOR CUTBACKS
      if (node.eq.kfirstnode) then
         if (time(1).lt.time1) then
            omega1=omega0+(domega/(time1-time0))*(time(1)-time0)
         endif
      endif
      u = omega1

      return
      end

C+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
