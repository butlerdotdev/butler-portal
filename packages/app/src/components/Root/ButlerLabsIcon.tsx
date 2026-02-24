import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
	icon: {
		width: 28,
		height: 28,
		borderRadius: 4,
		objectFit: 'contain',
	},
});

const ButlerLabsIcon = () => {
	const classes = useStyles();
	return <img src="/butler-labs-logo.svg" alt="" className={classes.icon} />;
};

export default ButlerLabsIcon;
