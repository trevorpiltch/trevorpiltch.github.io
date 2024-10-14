---
date: 2024-05-01
title: Bessel Function of the First Kind
description: Derivation of the Bessel Function from my differential equations class.
params:
    math: true
---
# The Bessel Function of the First Kind
I took differential equations in the winter of my first year at McGill. I absolutely loved that class and spent a lot of time after class talking to the professor and spending time learning other aspects of this field of math. One day, we learned about the Frobenius method of solving diff-eqs. Curious, I looked up what I could apply the method to, and found the Bessel Function. I tried deriving the function and wrote up my work below.

### Derivation
Let's analyze Bessel's equation. It's common to refer to the parameter p as the _order_ of the equation.:
$$x^2y''+xy'+(x^2-p^2)y=0$$
To start, let's get this in standard form by dividing by $x^2$:
$$ y''+\frac{1}{x}y'+(1-\frac{p^2}{x^2})y=0$$
This should be ringing some alarm bells with _x_ in the denominator, as $x=0$ makes this undefined. So we say $x_0=0$ is a _singular point_. Let's check if it's regular by checking $x\frac{Q}{P}$ and $x^2\frac{R}{P}$ :
$$x\frac{Q}{P}=1$$
$$x^2\frac{R}{P}=x^2-p^2$$
These are both analytic functions and are well defined for all x in $\mathbb{R}$. Notice that this means $x=0$ is a _regular singular point_. 
The next step in analyzing this ODE is to find the roots of the indicial equation. Recall the indicial equation is defined as
$F(r)=r(r-1)+b_0r+c_0=0$ Using the expressions from $x\frac{Q}{P}$ and $x^2\frac{R}{P}$, we get the expansions:
$$x\frac{Q}{P}=1+(0)O(x)$$
$$x^2\frac{R}{P}=-p^2+0x+x^2+(0)O(x^3)$$
From these, we can see that $b_0=1$ and $c_0=-p^2$ and the only other non-zero coefficient is $c_2=1$. Let's plug this back into our indicial equation and solve for the roots.
$$F(r)=r(r-1)+r-p^2$$
$$=r^2-r+r-p^2$$
$r^2-p^2$ $\Rightarrow r=± p$
For this example, we're only going to take $r=p$ but the process for $r=-p$ is the same. Let's calculate the first few coefficients using the _method of frobenius_:
$$a_n=\frac{-1}{F(n+p)}\sum_{k=0}^{n-1}a_k[(k+p)b_{n-k}+c_{n-k}]$$
$$a_1=\frac{-1}{F(1+p)}(0)=0$$
$$a_2=\frac{-1}{F(2+p)}\sum_{k=0}^{1}a_k[(k+p)b_{2-k}+c_{2-k}]=\frac{-1}{F(2+p)}a_0$$
$$a_3=\frac{-1}{F(3+p)}\sum_{k=0}^{2}a_k[(k+p)b_{3-k}+c_{3-k}]=\frac{-1}{F(3+p)}a_1$$
$$a_4=\frac{-1}{F(4+p)}\sum_{k=0}^{4}a_k[(k+p)b_{4-k}+c_{4-k}]=\frac{-1}{F(4+p)}a_2$$

Hopefully you've noticed a pattern here. The general term of $a_n$ is given by 
$$a_n=\frac{-a_{n-2}}{F(n+p)}$$
However, we can simplify this quite nicely by noticing that all the odd coefficients depend on $a_1$ which is identically equal to $0$. So we can reindex to only take the odd indicies and evaluate our function $F(n+p)$:
$$a_{2n}=\frac{-a_{2n-2}}{4n(n+p)}$$
Let's find the first few terms explicitly:
$$a_2=\frac{-a_0}{4*1(1+p)}$$
$$a_4=\frac{-a_2}{4*2*(2+p)}=\frac{(-1)^2a_0}{4^22*1(1+p)(2+p)}$$
$$\vdots$$
$$a_{2n}=\frac{(-1)^ka_0}{4^kk!(1+p)\dots(2+p)}$$
To simplify our calculations, we introduce the gamma function, which is a generalized factorial where $\Gamma(x+1)=x!$:
$$\Gamma(x)=\int_0^{\infty}e^{-t}t^{x-1}dt$$
We'll replace that in our expression to get:
$$a_{2n}=\frac{(-1)^ka_0}{4^k\Gamma(k+1)\Gamma(k+p+1)}$$
To get the Bessel function, we'll take $a_0=\frac{1}{2^p\Gamma(p+1)}$:
$$a_{2n}=\frac{(-1)^ka_0}{4^k2^p\Gamma(k+1)\Gamma(k+p+1)}$$
When we plug this into our series solution $y(x)$, we get
$$y(x)=\sum_{n=0}^{\infty}\frac{(-1)^n}{\Gamma(n+1)\Gamma(p+k+1)}(\frac{x}{2})^{2n+p}$$
And thus we have arrived at the Bessel function of the first kind, normally denoted by $J_1(x)$:
$$J_1(x)=\sum_{n=0}^{\infty}\frac{(-1)^n}{\Gamma(n+1)\Gamma(p+k+1)}(\frac{x}{2})^{2n+p}$$

As you can see, this is a pretty complicated function, but it has some nice practical uses. For example, it can be used to model vibrations in a circular drum. It's also useful for solving a whole host of ODEs in cylindrical coordinates and is a key part of the solution to the wave equation in cylindrical coordinates. Overall, it's a pretty cool function and I'm glad I fell down the Wikipedia rabbit hole to learn about it.
